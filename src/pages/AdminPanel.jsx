import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { useCustomGames } from '../context/CustomGamesContext';

const normalizeTagsInput = (value) => {
  if (typeof value !== 'string') return [];
  const unique = [];
  const seen = new Set();

  for (const item of value.split(',')) {
    const normalized = item.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }

  return unique.slice(0, 12);
};

const formatDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const diffColors = {
  Easy: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  Medium: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
  Hard: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
  Expert: 'text-red-400 bg-red-500/15 border-red-500/30',
};
const VIP_DURATION_OPTIONS = [30, 90, 180, 365];
const SUPPORT_STATUS_OPTIONS = ['open', 'pending', 'resolved', 'closed'];

const isSupportTicketUnread = (ticket, seenMap) => {
  const lastRole = ticket?.lastMessage?.senderRole;
  if (lastRole !== 'user') return false;
  const lastMessageAt = ticket?.lastMessageAt;
  if (!lastMessageAt) return false;
  const seenAt = seenMap?.[ticket.id];
  if (!seenAt) return true;
  return new Date(lastMessageAt).getTime() > new Date(seenAt).getTime();
};

const inputCls = 'w-full bg-zinc-800/80 border border-zinc-700/60 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/30 transition-all duration-200';
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5';

export default function AdminPanel() {
  const { user, loading } = useAuth();
  const { refreshCustomGames } = useCustomGames();
  const { t } = useTranslation();
  const [stats, setStats] = useState({ users: 0, games: 0, scores: 0, customGames: 0, mods: 0 });
  const [users, setUsers] = useState([]);
  const [games, setGames] = useState([]);
  const [activeTab, setActiveTab] = useState('games');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [gameSearch, setGameSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [newGame, setNewGame] = useState({ title: '', description: '', url: '', imageUrl: '', tags: '', publisher: '', players: '', controls: '', difficulty: 'Medium', vipOnly: false });
  const [editingGameId, setEditingGameId] = useState('');
  const [editForm, setEditForm] = useState({ title: '', description: '', url: '', imageUrl: '', difficulty: '', tags: '', publisher: '', players: '', controls: '', vipOnly: false });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showDeletedGames, setShowDeletedGames] = useState(false);
  const [showDeletedUsers, setShowDeletedUsers] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [vipGrantDays, setVipGrantDays] = useState(30);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentStats, setPaymentStats] = useState({ pending: 0, completed: 0, failed: 0, cancelled: 0, totalRevenue: 0, awaitingNotification: 0 });
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportSelectedId, setSupportSelectedId] = useState('');
  const [supportReplyText, setSupportReplyText] = useState('');
  const [supportStatusFilter, setSupportStatusFilter] = useState('');
  const [supportSeenMap, setSupportSeenMap] = useState({});
  const supportLastMapRef = useRef(new Map());

  // Helper to check if user can access admin panel (admin or mod)
  const canAccessAdmin = useMemo(() => {
    return user && ['admin', 'mod'].includes(user.role);
  }, [user]);

  const isAdmin = useMemo(() => user?.role === 'admin', [user]);

  const api = useMemo(() => {
    const instance = axios.create({ baseURL: (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '') });
    instance.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    return instance;
  }, []);

  const loadAdminData = async () => {
    try {
      setError('');
      let statsRes = null;
      let usersRes;
      let gamesRes;

      if (isAdmin) {
        [statsRes, usersRes, gamesRes] = await Promise.all([
          api.get('/admin/stats'),
          api.get('/admin/users?includeDeleted=true'),
          api.get('/admin/games?includeDeleted=true')
        ]);
      } else {
        [usersRes, gamesRes] = await Promise.all([
          api.get('/admin/users?includeDeleted=true'),
          api.get('/admin/games?includeDeleted=true')
        ]);
      }

      const nextUsers = Array.isArray(usersRes?.data) ? usersRes.data : [];
      const nextGames = Array.isArray(gamesRes?.data) ? gamesRes.data : [];
      setUsers(nextUsers);
      setGames(nextGames);
      if (statsRes?.data) {
        setStats(statsRes.data);
      } else {
        const mods = nextUsers.filter((item) => item?.role === 'mod').length;
        setStats({
          users: nextUsers.length,
          games: nextGames.length,
          scores: 0,
          customGames: nextGames.filter((item) => item?.isCustom).length,
          mods
        });
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load admin data');
    }
  };

  const loadSupportTickets = async ({ silent = false } = {}) => {
    try {
      if (!silent) setBusy(true);
      const params = supportStatusFilter ? { status: supportStatusFilter } : {};
      const res = await api.get('/support/tickets', { params });
      const items = Array.isArray(res.data) ? res.data : [];

      const nextMap = new Map(items.map((item) => [item.id, item.lastMessageAt]));
      const previousMap = supportLastMapRef.current;
      const hasNewUserMessage = items.some((item) => {
        const prevAt = previousMap.get(item.id);
        const nextAt = item.lastMessageAt;
        if (!prevAt || !nextAt || prevAt === nextAt) return false;
        const lastRole = item?.lastMessage?.senderRole;
        return lastRole === 'user';
      });
      if (hasNewUserMessage && activeTab === 'support') {
        setSuccess(t('adminSupport.newMessageFromUser'));
      }
      supportLastMapRef.current = nextMap;

      setSupportTickets(items);
      setSupportSelectedId((prev) => {
        if (prev && items.some((item) => item.id === prev)) return prev;
        return items[0]?.id || '';
      });
    } catch (err) {
      if (!silent) {
        setError(err?.response?.data?.message || t('adminSupport.loadError'));
      }
    } finally {
      if (!silent) setBusy(false);
    }
  };

  const onSupportReply = async () => {
    const selected = supportTickets.find((item) => item.id === supportSelectedId);
    if (!selected || !supportReplyText.trim()) return;
    try {
      setBusy(true);
      await api.post(`/support/tickets/${selected.id}/messages`, { content: supportReplyText.trim() });
      setSupportReplyText('');
      await loadSupportTickets({ silent: false });
      setSuccess(t('adminSupport.replySuccess'));
    } catch (err) {
      setError(err?.response?.data?.message || t('adminSupport.replyError'));
    } finally {
      setBusy(false);
    }
  };

  const onSupportStatusChange = async (ticketId, status) => {
    try {
      setBusy(true);
      await api.patch(`/support/tickets/${ticketId}/status`, { status });
      await loadSupportTickets({ silent: false });
      setSuccess(t('adminSupport.statusSuccess'));
    } catch (err) {
      setError(err?.response?.data?.message || t('adminSupport.statusError'));
    } finally {
      setBusy(false);
    }
  };

  const loadAuditLogs = async () => {
    if (!isAdmin) return;
    try {
      setLogsLoading(true);
      const res = await api.get('/admin/audit-logs?limit=100');
      setAuditLogs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load audit logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const onRestoreUser = async (id) => {
    try {
      setBusy(true);
      await api.post(`/admin/users/${id}/restore`);
      flash('User restored');
      await loadAdminData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to restore user');
    } finally {
      setBusy(false);
    }
  };

  const onToggleVip = async (target, shouldGrant, grantDays = 30) => {
    if (!isAdmin) return;
    try {
      setBusy(true);
      const normalizedDays = Number.isInteger(Number(grantDays)) ? Math.min(Math.max(Number(grantDays), 1), 3650) : 30;
      await api.patch(`/admin/users/${target._id}/vip`, shouldGrant
        ? { action: 'grant', days: normalizedDays }
        : { action: 'revoke' }
      );
      flash(shouldGrant ? `${target.username} received VIP (${normalizedDays} days)` : `${target.username} VIP revoked`);
      await loadAdminData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to update VIP status');
    } finally {
      setBusy(false);
    }
  };

  const onRestoreGame = async (id) => {
    try {
      setBusy(true);
      await api.post(`/admin/games/${id}/restore`);
      flash('Game restored');
      await loadAdminData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to restore game');
    } finally {
      setBusy(false);
    }
  };

  const onDeleteUser = async (id) => {
    try {
      setBusy(true);
      await api.delete(`/admin/users/${id}`);
      flash('User moved to trash');
      setConfirmDelete(null);
      await loadAdminData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to delete user');
    } finally {
      setBusy(false);
    }
  };

  const onDeleteGame = async (id) => {
    try {
      setBusy(true);
      await api.delete(`/admin/games/${id}`);
      flash('Game moved to trash');
      setConfirmDelete(null);
      await loadAdminData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to delete game');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!loading && canAccessAdmin) {
      loadAdminData();
    }
  }, [loading, canAccessAdmin]);

  useEffect(() => {
    if (!loading && canAccessAdmin && isAdmin && activeTab === 'logs') {
      loadAuditLogs();
    }
  }, [loading, canAccessAdmin, isAdmin, activeTab]);

  useEffect(() => {
    if (!loading && canAccessAdmin && activeTab === 'payments') {
      loadPayments();
    }
  }, [loading, canAccessAdmin, activeTab]);

  useEffect(() => {
    if (loading || !canAccessAdmin || activeTab !== 'payments') return undefined;
    const timer = window.setInterval(() => {
      loadPayments({ silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loading, canAccessAdmin, activeTab]);

  const loadPayments = async ({ silent = false } = {}) => {
    if (!isAdmin) return;
    try {
      if (!silent) setPaymentsLoading(true);
      const [res, statsRes] = await Promise.all([
        api.get('/auth/admin/payments'),
        api.get('/auth/admin/payments/stats')
      ]);
      setPayments(Array.isArray(res.data?.payments) ? res.data.payments : []);
      if (statsRes.data?.stats) {
        setPaymentStats(statsRes.data.stats);
      }
    } catch (err) {
      if (!silent) setError(err?.response?.data?.message || 'Unable to load payments');
    } finally {
      if (!silent) setPaymentsLoading(false);
    }
  };

  const onNotifyPayment = async (paymentId) => {
    try {
      setBusy(true);
      await api.patch(`/auth/admin/payments/${paymentId}/notify`);
      await loadPayments({ silent: true });
      setSuccess('Payment marked as notified');
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to update payment');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!loading && canAccessAdmin && activeTab === 'support') {
      loadSupportTickets();
    }
  }, [loading, canAccessAdmin, activeTab, supportStatusFilter]);

  useEffect(() => {
    if (loading || !canAccessAdmin || activeTab !== 'support') return undefined;
    const timer = window.setInterval(() => {
      loadSupportTickets({ silent: true });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [loading, canAccessAdmin, activeTab, supportStatusFilter]);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 3000);
      return () => clearTimeout(t);
    }
  }, [success]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-400 text-sm">{t('admin.loading')}</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!canAccessAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <Navbar />
        <div className="pt-40 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <div className="text-xl font-bold">You don't have access to the admin panel</div>
          <p className="text-zinc-500 mt-2">Only admins and moderators can access this area.</p>
        </div>
      </div>
    );
  }

  const flash = (msg) => setSuccess(msg);

  const onChangeRole = async (target, newRole) => {
    if (!isAdmin) return;
    try {
      setBusy(true);
      await api.patch(`/admin/users/${target._id}/role`, { role: newRole });
      flash(`${target.username} → ${newRole}`);
      await loadAdminData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to update user role');
    } finally {
      setBusy(false);
    }
  };

  const onCreateGame = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      const tags = normalizeTagsInput(newGame.tags);
      await api.post('/admin/games', {
        ...newGame,
        tags,
        vipOnly: Boolean(newGame.vipOnly),
        isCustom: true,
        color: 'group-hover:shadow-[0_0_30px_rgba(255,165,0,0.5)]'
      });
      setNewGame({ title: '', description: '', url: '', imageUrl: '', tags: '', publisher: '', players: '', controls: '', difficulty: 'Medium', vipOnly: false });
      setShowAddForm(false);
      flash('Game added successfully!');
      await Promise.all([loadAdminData(), refreshCustomGames()]);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to add game');
    } finally {
      setBusy(false);
    }
  };

  const onStartEditGame = (game) => {
    setEditingGameId(game._id);
    setEditForm({
      title: game.title || '',
      description: game.description || '',
      url: game.url || '',
      imageUrl: game.imageUrl || '',
      difficulty: game.difficulty || 'Medium',
      tags: Array.isArray(game.tags) ? game.tags.join(', ') : '',
      publisher: game.publisher || '',
      players: game.players || '',
      controls: game.controls || '',
      vipOnly: Boolean(game.vipOnly),
    });
  };

  const onSaveGame = async () => {
    try {
      setBusy(true);
      await api.put(`/admin/games/${editingGameId}`, {
        ...editForm,
        vipOnly: Boolean(editForm.vipOnly),
        tags: normalizeTagsInput(editForm.tags)
      });
      setEditingGameId('');
      flash('Changes saved!');
      await Promise.all([loadAdminData(), refreshCustomGames()]);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to update game');
    } finally {
      setBusy(false);
    }
  };

  const filteredGames = games.filter((g) => {
    if (!showDeletedGames && g.deletedAt) return false;
    if (!gameSearch) return true;
    const q = gameSearch.toLowerCase();
    return (g.title || '').toLowerCase().includes(q) || (g.category || '').toLowerCase().includes(q);
  });

  const filteredUsers = users.filter((u) => {
    if (!showDeletedUsers && u.deletedAt) return false;
    if (!userSearch) return true;
    return (u.username || '').toLowerCase().includes(userSearch.toLowerCase());
  });

  const existingTags = useMemo(() => {
    const unique = [];
    const seen = new Set();

    for (const game of games || []) {
      const sourceTags = Array.isArray(game?.tags) && game.tags.length > 0
        ? game.tags
        : [game?.category, game?.difficulty];

      for (const rawTag of sourceTags) {
        if (typeof rawTag !== 'string') continue;
        const normalized = rawTag.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        unique.push(normalized);
      }
    }

    return unique.slice(0, 30);
  }, [games]);

  const selectedNewTags = useMemo(() => normalizeTagsInput(newGame.tags), [newGame.tags]);
  const selectedEditTags = useMemo(() => normalizeTagsInput(editForm.tags), [editForm.tags]);

  const toggleNewGameQuickTag = (tag) => {
    const normalizedTag = typeof tag === 'string' ? tag.trim().toLowerCase().replace(/\s+/g, ' ') : '';
    if (!normalizedTag) return;

    const nextTags = selectedNewTags.includes(normalizedTag)
      ? selectedNewTags.filter((item) => item !== normalizedTag)
      : [...selectedNewTags, normalizedTag];

    setNewGame((prev) => ({ ...prev, tags: nextTags.join(', ') }));
  };

  const toggleEditGameQuickTag = (tag) => {
    const normalizedTag = typeof tag === 'string' ? tag.trim().toLowerCase().replace(/\s+/g, ' ') : '';
    if (!normalizedTag) return;

    const nextTags = selectedEditTags.includes(normalizedTag)
      ? selectedEditTags.filter((item) => item !== normalizedTag)
      : [...selectedEditTags, normalizedTag];

    setEditForm((prev) => ({ ...prev, tags: nextTags.join(', ') }));
  };

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const modCount = users.filter((u) => u.role === 'mod').length;

  const statCards = [
    { label: 'Total Users', value: stats.users, icon: '👥', color: 'from-blue-500/20 to-cyan-500/20', border: 'border-cyan-500/20', accent: 'text-cyan-400' },
    { label: 'Total Games', value: stats.games, icon: '🎮', color: 'from-purple-500/20 to-pink-500/20', border: 'border-purple-500/20', accent: 'text-purple-400' },
    { label: 'Total Scores', value: stats.scores, icon: '🏆', color: 'from-amber-500/20 to-orange-500/20', border: 'border-amber-500/20', accent: 'text-amber-400' },
    { label: 'Moderators', value: stats.mods || modCount, icon: '🛡️', color: 'from-emerald-500/20 to-teal-500/20', border: 'border-emerald-500/20', accent: 'text-emerald-400' },
  ];

  const tabs = [
    { key: 'games', label: t('admin.tabs.games'), icon: '🎮', count: games.length },
    { key: 'users', label: t('admin.tabs.users'), icon: '👥', count: users.length },
    { key: 'support', label: t('adminSupport.support'), icon: '💬', count: supportTickets.length },
    { key: 'payments', label: 'Payments', icon: '💰', count: paymentStats.awaitingNotification },
    ...(isAdmin ? [{ key: 'logs', label: t('admin.tabs.logs'), icon: '📜', count: auditLogs.length }] : []),
  ];

  const supportSortedTickets = useMemo(() => {
    return [...supportTickets].sort((a, b) => {
      const aUnread = isSupportTicketUnread(a, supportSeenMap);
      const bUnread = isSupportTicketUnread(b, supportSeenMap);
      if (aUnread !== bUnread) return aUnread ? -1 : 1;
      const aTime = new Date(a?.lastMessageAt || a?.createdAt || 0).getTime();
      const bTime = new Date(b?.lastMessageAt || b?.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [supportTickets, supportSeenMap]);

  const supportSelectedTicket = supportTickets.find((item) => item.id === supportSelectedId) || null;
  const selectedSupportLastAt = supportSelectedTicket?.lastMessageAt || '';
  const selectedSupportLastRole = supportSelectedTicket?.lastMessage?.senderRole || '';

  const onSelectSupportTicket = (ticket) => {
    setSupportSelectedId(ticket.id);
    setSupportSeenMap((prev) => ({
      ...prev,
      [ticket.id]: ticket.lastMessageAt || new Date().toISOString()
    }));
  };

  useEffect(() => {
    if (activeTab !== 'support' || !supportSelectedTicket) return;
    if (selectedSupportLastRole !== 'user') return;
    if (!selectedSupportLastAt) return;
    setSupportSeenMap((prev) => {
      if (prev[supportSelectedTicket.id] === selectedSupportLastAt) return prev;
      return {
        ...prev,
        [supportSelectedTicket.id]: selectedSupportLastAt
      };
    });
  }, [activeTab, supportSelectedTicket, selectedSupportLastAt, selectedSupportLastRole]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white animate-page-in">
      <Navbar />

      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,0.06),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.06),transparent_50%)]" />
      </div>

      <div className="relative z-10 container mx-auto px-4 md:px-6 pt-28 pb-16">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 animate-fade-up">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400/80 mb-1">Control Center</p>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Admin Dashboard</h1>
            <p className="text-zinc-500 text-sm mt-1">Manage games, users, and monitor platform activity.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900/70 border border-zinc-800">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs text-zinc-400">Online as <span className="text-white font-semibold">{user.username}</span></span>
            </div>
            <button
              onClick={loadAdminData}
              disabled={busy}
              className="p-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-all text-zinc-400 hover:text-white disabled:opacity-50"
              title="Refresh data"
            >
              <svg className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 animate-fade-up">
            <span className="text-red-400 text-lg">⚠️</span>
            <span className="text-red-300 text-sm flex-1">{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-300 text-xs font-bold">✕</button>
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3 animate-fade-up">
            <span className="text-emerald-400 text-lg">✅</span>
            <span className="text-emerald-300 text-sm">{success}</span>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
          {statCards.map((s, i) => (
            <div
              key={s.label}
              className={`relative overflow-hidden rounded-2xl border ${s.border} bg-gradient-to-br ${s.color} p-4 md:p-5 animate-fade-up`}
              style={{ '--delay': `${i * 50}ms` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">{s.label}</p>
                  <p className={`text-2xl md:text-3xl font-black ${s.accent}`}>{s.value}</p>
                </div>
                <span className="text-2xl opacity-60">{s.icon}</span>
              </div>
              <div className="absolute -bottom-2 -right-2 w-20 h-20 rounded-full bg-white/5 blur-xl" />
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                activeTab === tab.key
                  ? 'bg-white text-black shadow-lg shadow-white/10'
                  : 'bg-zinc-900/70 text-zinc-400 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === tab.key ? 'bg-black/10 text-black/60' : 'bg-white/10 text-zinc-500'
              }`}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* ===== GAMES TAB ===== */}
        {activeTab === 'games' && (
          <div className="space-y-5 animate-fade-up">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
              <div className="relative flex-1 max-w-md w-full">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                </svg>
                <input
                  type="text"
                  value={gameSearch}
                  onChange={(e) => setGameSearch(e.target.value)}
                  placeholder="Search games..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/30 transition-all"
                />
              </div>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                disabled={busy}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                  showAddForm
                    ? 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30'
                }`}
              >
                <span className="text-base">{showAddForm ? '✕' : '+'}</span>
                {showAddForm ? 'Close' : 'Add Game'}
              </button>
              <button
                onClick={() => setShowDeletedGames((prev) => !prev)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                  showDeletedGames
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-zinc-900/70 text-zinc-400 border-zinc-800 hover:bg-zinc-800'
                }`}
              >
                {showDeletedGames ? t('admin.hideTrash') : t('admin.showTrash')}
              </button>
            </div>

            {/* Add Game Form */}
            {showAddForm && (
              <form onSubmit={onCreateGame} className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 backdrop-blur-sm p-5 md:p-6 animate-fade-up">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="text-cyan-400">+</span> Add New Game
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={labelCls}>Title *</label>
                    <input value={newGame.title} onChange={(e) => setNewGame({ ...newGame, title: e.target.value })} placeholder="Game title" className={inputCls} required />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>Game URL *</label>
                    <input value={newGame.url} onChange={(e) => setNewGame({ ...newGame, url: e.target.value })} placeholder="https://..." className={inputCls} required />
                  </div>
                  <div>
                    <label className={labelCls}>Image URL</label>
                    <input value={newGame.imageUrl} onChange={(e) => setNewGame({ ...newGame, imageUrl: e.target.value })} placeholder="https://..." className={inputCls} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>Description</label>
                    <textarea value={newGame.description} onChange={(e) => setNewGame({ ...newGame, description: e.target.value })} placeholder="Short description..." className={`${inputCls} h-20 resize-none`} />
                  </div>
                  <div>
                    <label className={labelCls}>Publisher</label>
                    <input value={newGame.publisher} onChange={(e) => setNewGame({ ...newGame, publisher: e.target.value })} placeholder="Studio name" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Players</label>
                    <input value={newGame.players} onChange={(e) => setNewGame({ ...newGame, players: e.target.value })} placeholder="e.g. 1 Player" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Controls</label>
                    <input value={newGame.controls} onChange={(e) => setNewGame({ ...newGame, controls: e.target.value })} placeholder="e.g. Keyboard" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Difficulty</label>
                    <select value={newGame.difficulty} onChange={(e) => setNewGame({ ...newGame, difficulty: e.target.value })} className={inputCls}>
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                      <option value="Expert">Expert</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>Tags (comma separated)</label>
                    <input value={newGame.tags} onChange={(e) => setNewGame({ ...newGame, tags: e.target.value })} placeholder="action, puzzle, retro" className={inputCls} />
                    <div className="mt-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Quick tags</p>
                      {existingTags.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {existingTags.map((tag) => {
                            const active = selectedNewTags.includes(tag);
                            return (
                              <button
                                key={`new-${tag}`}
                                type="button"
                                onClick={() => toggleNewGameQuickTag(tag)}
                                className={`px-2.5 py-1 rounded-full border text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
                                  active
                                    ? 'border-cyan-300/60 bg-cyan-400/20 text-cyan-100'
                                    : 'border-zinc-600 bg-zinc-800/70 text-zinc-300 hover:border-cyan-400/40 hover:text-cyan-200'
                                }`}
                              >
                                #{tag}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500">No existing tags yet.</p>
                      )}
                    </div>
                    {selectedNewTags.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Selected tags</p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedNewTags.map((tag) => (
                            <span key={`selected-new-${tag}`} className="px-2 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/25 text-cyan-200 text-[10px] font-bold">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={Boolean(newGame.vipOnly)}
                        onChange={(e) => setNewGame({ ...newGame, vipOnly: e.target.checked })}
                        className="w-4 h-4 accent-amber-500"
                      />
                      <span className="text-xs font-bold text-amber-200">VIP only game</span>
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-5">
                  <button type="button" onClick={() => setShowAddForm(false)} className="px-5 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-bold hover:bg-zinc-700 transition-colors">Cancel</button>
                  <button type="submit" disabled={busy} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-bold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 disabled:opacity-50 transition-all">
                    {busy ? 'Adding...' : 'Add Game'}
                  </button>
                </div>
              </form>
            )}

            {/* Games List */}
            <div className="space-y-3">
              {filteredGames.length === 0 ? (
                <div className="text-center py-16 text-zinc-500">
                  <div className="text-4xl mb-3">🎮</div>
                  <p className="font-medium">{gameSearch ? 'No games match your search' : 'No games yet'}</p>
                </div>
              ) : filteredGames.map((game, idx) => (
                <div
                  key={game._id}
                  className={`group rounded-2xl border transition-all duration-200 ${
                    editingGameId === game._id
                      ? 'border-cyan-500/30 bg-zinc-900/90'
                      : 'border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900/70'
                  }`}
                >
                  {editingGameId === game._id ? (
                    /* ---- EDIT MODE ---- */
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        onSaveGame();
                      }}
                      className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 backdrop-blur-sm p-5 md:p-6"
                    >
                      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span className="text-cyan-400">✏️</span> Editing: {game.title}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className={labelCls}>Title *</label>
                          <input
                            value={editForm.title}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            placeholder="Game title"
                            className={inputCls}
                            required
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className={labelCls}>Game URL *</label>
                          <input
                            value={editForm.url}
                            onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                            placeholder="https://..."
                            className={inputCls}
                            required
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Image URL</label>
                          <input
                            value={editForm.imageUrl}
                            onChange={(e) => setEditForm({ ...editForm, imageUrl: e.target.value })}
                            placeholder="https://..."
                            className={inputCls}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className={labelCls}>Description</label>
                          <textarea
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            placeholder="Short description..."
                            className={`${inputCls} h-20 resize-none`}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Publisher</label>
                          <input
                            value={editForm.publisher}
                            onChange={(e) => setEditForm({ ...editForm, publisher: e.target.value })}
                            placeholder="Studio name"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Players</label>
                          <input
                            value={editForm.players}
                            onChange={(e) => setEditForm({ ...editForm, players: e.target.value })}
                            placeholder="e.g. 1 Player"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Controls</label>
                          <input
                            value={editForm.controls}
                            onChange={(e) => setEditForm({ ...editForm, controls: e.target.value })}
                            placeholder="e.g. Keyboard"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Difficulty</label>
                          <select value={editForm.difficulty} onChange={(e) => setEditForm({ ...editForm, difficulty: e.target.value })} className={inputCls}>
                            <option value="Easy">Easy</option>
                            <option value="Medium">Medium</option>
                            <option value="Hard">Hard</option>
                            <option value="Expert">Expert</option>
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className={labelCls}>Tags (comma separated)</label>
                          <input
                            value={editForm.tags}
                            onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                            placeholder="action, puzzle, retro"
                            className={inputCls}
                          />
                          <div className="mt-3">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Quick tags</p>
                            {existingTags.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {existingTags.map((tag) => {
                                  const active = selectedEditTags.includes(tag);
                                  return (
                                    <button
                                      key={`edit-${game._id}-${tag}`}
                                      type="button"
                                      onClick={() => toggleEditGameQuickTag(tag)}
                                      className={`px-2.5 py-1 rounded-full border text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
                                        active
                                          ? 'border-cyan-300/60 bg-cyan-400/20 text-cyan-100'
                                          : 'border-zinc-600 bg-zinc-800/70 text-zinc-300 hover:border-cyan-400/40 hover:text-cyan-200'
                                      }`}
                                    >
                                      #{tag}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-xs text-zinc-500">No existing tags yet.</p>
                            )}
                          </div>
                          {selectedEditTags.length > 0 && (
                            <div className="mt-2">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Selected tags</p>
                              <div className="flex flex-wrap gap-1.5">
                                {selectedEditTags.map((tag) => (
                                  <span key={`selected-edit-${tag}`} className="px-2 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/25 text-cyan-200 text-[10px] font-bold">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="md:col-span-2">
                          <label className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={Boolean(editForm.vipOnly)}
                              onChange={(e) => setEditForm({ ...editForm, vipOnly: e.target.checked })}
                              className="w-4 h-4 accent-amber-500"
                            />
                            <span className="text-xs font-bold text-amber-200">VIP only game</span>
                          </label>
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 mt-5">
                        <button
                          type="button"
                          onClick={() => setEditingGameId('')}
                          className="px-5 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-bold hover:bg-zinc-700 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={busy}
                          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-bold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 disabled:opacity-50 transition-all"
                        >
                          {busy ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* ---- VIEW MODE ---- */
                    <div className="flex items-stretch gap-0">
                      {/* Thumbnail */}
                      <div className="hidden sm:block w-28 md:w-36 shrink-0">
                        <div className="relative h-full rounded-l-2xl overflow-hidden bg-zinc-800">
                          {game.imageUrl ? (
                            <img src={game.imageUrl} alt={game.title} className="absolute inset-0 w-full h-full object-cover" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-3xl text-zinc-700">🎮</div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-zinc-900/40" />
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 p-4 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h4 className="font-bold text-sm text-white truncate">{game.title}</h4>
                              {game.deletedAt && (
                                <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 rounded">{t('admin.trashed')}</span>
                              )}
                              {game.rating > 0 && (
                                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 rounded">★ {Number(game.rating).toFixed(1)}</span>
                              )}
                              {game.difficulty && diffColors[game.difficulty] && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${diffColors[game.difficulty]}`}>{game.difficulty}</span>
                              )}
                              {game.vipOnly && (
                                <span className="text-[10px] font-bold text-amber-200 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">VIP</span>
                              )}
                            </div>

                            {game.description && (
                              <p className="text-[11px] text-zinc-500 line-clamp-1 mb-1.5">{game.description}</p>
                            )}

                            {/* Meta row */}
                            <div className="flex items-center gap-3 flex-wrap text-[10px] text-zinc-500">
                              {game.publisher && <span>🏢 {game.publisher}</span>}
                              {game.players && <span>👥 {game.players}</span>}
                              {game.controls && <span>🎮 {game.controls}</span>}
                              <span>📅 {formatDate(game.createdAt)}</span>
                            </div>

                            {/* Tags */}
                            {Array.isArray(game.tags) && game.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {game.tags.map((tag) => (
                                  <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/10 text-cyan-300/80 border border-cyan-500/15">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* URL */}
                            <p className="text-[10px] text-zinc-600 truncate mt-1.5 max-w-lg">{game.url}</p>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => onStartEditGame(game)}
                              disabled={Boolean(game.deletedAt)}
                              className="p-2 rounded-lg bg-zinc-800/80 text-zinc-400 hover:bg-blue-500/20 hover:text-blue-400 border border-transparent hover:border-blue-500/30 transition-all disabled:opacity-30"
                              title="Edit"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                            </button>
                            {game.deletedAt ? (
                              <button
                                onClick={() => onRestoreGame(game._id)}
                                disabled={busy}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold hover:bg-emerald-500/30 disabled:opacity-40"
                              >
                                {t('admin.restore')}
                              </button>
                            ) : confirmDelete === game._id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => onDeleteGame(game._id)}
                                  disabled={busy}
                                  className="px-2.5 py-1.5 rounded-lg bg-red-500 text-white text-[10px] font-bold hover:bg-red-400 transition-colors"
                                >Confirm</button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="px-2 py-1.5 rounded-lg bg-zinc-700 text-zinc-300 text-[10px] font-bold hover:bg-zinc-600 transition-colors"
                                >Cancel</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDelete(game._id)}
                                className="p-2 rounded-lg bg-zinc-800/80 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 border border-transparent hover:border-red-500/30 transition-all"
                                title="Delete"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== USERS TAB ===== */}
        {activeTab === 'users' && (
          <div className="space-y-5 animate-fade-up">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
              <div className="relative flex-1 max-w-md w-full">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                </svg>
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/30 transition-all"
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/20 font-bold">{adminCount} Admins</span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 font-bold">{modCount} Mods</span>
                <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 font-bold">{users.length - adminCount - modCount} Users</span>
                {isAdmin && (
                  <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-200">
                    <span className="font-bold">VIP</span>
                    <select
                      value={vipGrantDays}
                      onChange={(e) => setVipGrantDays(Number(e.target.value) || 30)}
                      className="bg-zinc-900 border border-amber-500/30 rounded px-1.5 py-0.5 text-[10px] font-bold text-amber-100"
                    >
                      {VIP_DURATION_OPTIONS.map((days) => (
                        <option key={days} value={days}>{days}d</option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  onClick={() => setShowDeletedUsers((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-lg border font-bold transition-colors ${
                    showDeletedUsers
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-zinc-900/70 text-zinc-400 border-zinc-800 hover:bg-zinc-800'
                  }`}
                >
                  {showDeletedUsers ? t('admin.hideTrash') : t('admin.showTrash')}
                </button>
              </div>
            </div>

            {/* Users List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredUsers.length === 0 ? (
                <div className="md:col-span-2 text-center py-16 text-zinc-500">
                  <div className="text-4xl mb-3">👥</div>
                  <p className="font-medium">{userSearch ? 'No users found' : 'No users yet'}</p>
                </div>
              ) : filteredUsers.map((u) => {
                const role = u.role || 'user';
                const vipExpiresMs = u?.vipExpiresAt ? new Date(u.vipExpiresAt).getTime() : 0;
                const isVipActive = u?.vipTier === 'vip' && Number.isFinite(vipExpiresMs) && vipExpiresMs > Date.now();
                const vipExpiresLabel = isVipActive ? formatDate(u.vipExpiresAt) : '—';
                const roleConfig = {
                  admin: { color: 'border-purple-500/30 bg-gradient-to-r from-purple-500/10 to-transparent', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30', icon: '👑', label: 'ADMIN' },
                  mod: { color: 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-transparent', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: '🛡️', label: 'MOD' },
                  user: { color: 'border-zinc-700/80 bg-zinc-900/50', badge: 'bg-zinc-700/50 text-zinc-400 border-zinc-600/50', icon: '👤', label: 'USER' }
                };
                const cfg = roleConfig[role] || roleConfig.user;
                return (
                <div
                  key={u._id}
                  className={`flex items-center gap-3 p-4 rounded-2xl border transition-all duration-200 ${cfg.color}`}
                >
                  {/* Avatar */}
                  <div className={`relative w-10 h-10 rounded-full overflow-hidden shrink-0 border-2 ${role === 'admin' ? 'border-purple-500' : role === 'mod' ? 'border-emerald-500' : 'border-zinc-700'}`}>
                    {u.avatar ? (
                      <img src={u.avatar} alt={u.username} className="w-full h-full object-cover" />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center text-sm font-black ${role === 'admin' ? 'bg-purple-500/20 text-purple-300' : role === 'mod' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-500'}`}>
                        {(u.username || '?')[0].toUpperCase()}
                      </div>
                    )}
                    {(role === 'admin' || role === 'mod') && (
                      <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 ${role === 'admin' ? 'bg-purple-500' : 'bg-emerald-500'} rounded-full flex items-center justify-center border-2 border-zinc-950`}>
                        <span className="text-[7px]">{cfg.icon}</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm truncate">{u.username}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cfg.badge}`}>{cfg.label}</span>
                      {isVipActive && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/20 text-amber-200 border-amber-400/35">VIP</span>
                      )}
                      {u.deletedAt && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/20 text-amber-300 border-amber-500/30">{t('admin.trashed')}</span>
                      )}
                    </div>
                    {u.email && <p className="text-[11px] text-zinc-500 truncate">{u.email}</p>}
                    <p className="text-[10px] text-zinc-600">Joined {formatDate(u.createdAt)}</p>
                    <p className="text-[10px] text-zinc-600">VIP expires: {vipExpiresLabel}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isAdmin && !u.deletedAt && (
                      <button
                        onClick={() => onToggleVip(u, !isVipActive, vipGrantDays)}
                        disabled={busy}
                        className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all disabled:opacity-40 ${
                          isVipActive
                            ? 'bg-red-500/15 text-red-300 border-red-500/30 hover:bg-red-500/25'
                            : 'bg-amber-500/15 text-amber-200 border-amber-400/35 hover:bg-amber-500/25'
                        }`}
                      >
                        {isVipActive ? 'Revoke VIP' : 'Grant VIP'}
                      </button>
                    )}
                    {isAdmin && (
                      <select
                        value={role}
                        onChange={(e) => onChangeRole(u, e.target.value)}
                        disabled={busy || u._id === user._id || Boolean(u.deletedAt)}
                        className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-all disabled:opacity-40"
                      >
                        <option value="user">User</option>
                        <option value="mod">Mod</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                    {u.deletedAt ? (
                      <button
                        onClick={() => onRestoreUser(u._id)}
                        disabled={busy}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 disabled:opacity-40"
                      >
                        {t('admin.restore')}
                      </button>
                    ) : confirmDelete === u._id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => onDeleteUser(u._id)} disabled={busy} className="px-2 py-1.5 rounded-lg bg-red-500 text-white text-[10px] font-bold">Confirm</button>
                        <button onClick={() => setConfirmDelete(null)} className="px-2 py-1.5 rounded-lg bg-zinc-700 text-zinc-300 text-[10px] font-bold">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(u._id)}
                        disabled={u._id === user._id}
                        className="p-1.5 rounded-lg bg-zinc-800/80 text-zinc-500 hover:bg-red-500/20 hover:text-red-400 border border-transparent hover:border-red-500/30 transition-all disabled:opacity-30"
                        title="Delete user"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );}
              )}
            </div>
          </div>
        )}

        {/* ===== AUDIT LOGS TAB ===== */}
        {isAdmin && activeTab === 'logs' && (
          <div className="space-y-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500">Latest 100 actions</p>
              <button
                onClick={loadAuditLogs}
                disabled={logsLoading}
                className="px-4 py-2 rounded-xl bg-zinc-900/70 border border-zinc-800 text-xs font-bold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                {logsLoading ? t('admin.logsLoading') : 'Refresh Logs'}
              </button>
            </div>

            {logsLoading ? (
              <div className="text-center py-12 text-zinc-500 text-sm">{t('admin.logsLoading')}</div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-sm">{t('admin.logsEmpty')}</div>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => {
                  const actorName = log?.actor?.username || 'System';
                  const action = (log?.action || 'unknown_action').replace(/_/g, ' ');
                  return (
                    <div key={log._id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 md:p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 font-bold">{actorName}</span>
                        <span className="text-zinc-300 font-semibold">{action}</span>
                        {log?.targetType && <span className="text-zinc-500">on {log.targetType}</span>}
                        {log?.targetLabel && <span className="text-zinc-400">{log.targetLabel}</span>}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-500 flex flex-wrap gap-3">
                        <span>{formatDate(log.createdAt)}</span>
                        {log?.actorRole && <span>role: {log.actorRole}</span>}
                        {log?.ip && <span>ip: {log.ip}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== SUPPORT TAB ===== */}
        {activeTab === 'support' && (
          <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4 animate-fade-up">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="flex items-center gap-2 mb-3">
                <select
                  value={supportStatusFilter}
                  onChange={(e) => setSupportStatusFilter(e.target.value)}
                  className="flex-1 rounded-lg bg-zinc-900 border border-zinc-700 px-2.5 py-2 text-xs font-bold uppercase"
                >
                  <option value="">{t('adminSupport.allStatus')}</option>
                  {SUPPORT_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{t(`support.status.${status}`)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => loadSupportTickets({ silent: false })}
                  className="px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
                >
                  {t('adminSupport.refresh')}
                </button>
              </div>

              <div className="max-h-[560px] overflow-y-auto space-y-2 pr-1">
                {supportTickets.length === 0 ? (
                  <p className="text-sm text-zinc-500 p-2">{t('adminSupport.noTickets')}</p>
                ) : supportSortedTickets.map((ticket) => (
                  (() => {
                    const unread = isSupportTicketUnread(ticket, supportSeenMap);
                    return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => onSelectSupportTicket(ticket)}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${supportSelectedId === ticket.id ? 'border-cyan-400/35 bg-cyan-400/10' : unread ? 'border-amber-400/55 bg-amber-400/10 hover:border-amber-300/70' : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-white line-clamp-1">{ticket.subject}</p>
                      <div className="flex items-center gap-1.5">
                        {unread && (
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded border border-amber-300/70 bg-amber-400/20 text-amber-100 font-black">{t('supportChatbot.new')}</span>
                        )}
                        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-300 font-bold">{t(`support.status.${ticket.status}`)}</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1 line-clamp-1">{ticket?.user?.username || t('support.user')} • {t(`support.categories.${ticket.category}`)}</p>
                    <p className="text-[10px] text-zinc-600 mt-1">{formatDate(ticket.lastMessageAt)}</p>
                  </button>
                    );
                  })()
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 min-h-[560px] flex flex-col">
              {supportSelectedTicket ? (
                <>
                  <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-black truncate">{supportSelectedTicket.subject}</h3>
                      <p className="text-xs text-zinc-500 mt-1">{supportSelectedTicket?.user?.username || t('support.user')} • {t(`support.categories.${supportSelectedTicket.category}`)}</p>
                    </div>
                    <select
                      value={supportSelectedTicket.status}
                      onChange={(e) => onSupportStatusChange(supportSelectedTicket.id, e.target.value)}
                      className="rounded-lg bg-zinc-900 border border-zinc-700 px-2.5 py-2 text-xs font-bold uppercase"
                      disabled={busy}
                    >
                      {SUPPORT_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{t(`support.status.${status}`)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {Array.isArray(supportSelectedTicket.messages) && supportSelectedTicket.messages.length > 0 ? supportSelectedTicket.messages.map((msg) => {
                      const mine = ['admin', 'mod'].includes(msg.senderRole);
                      return (
                        <div key={msg.id} className={`max-w-[82%] rounded-xl px-3 py-2 border text-sm ${mine ? 'ml-auto bg-cyan-500 text-zinc-950 border-cyan-400/60' : 'mr-auto bg-zinc-950 text-zinc-200 border-zinc-700'}`}>
                          <div className={`text-[11px] mb-1 ${mine ? 'text-zinc-900/80' : 'text-zinc-500'}`}>
                            {msg?.sender?.username || msg.senderRole} • {formatDate(msg.createdAt)}
                          </div>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      );
                    }) : (
                      <p className="text-sm text-zinc-500">{t('adminSupport.noMessages')}</p>
                    )}
                  </div>

                  <div className="p-4 border-t border-zinc-800">
                    <div className="flex items-end gap-2">
                      <textarea
                        value={supportReplyText}
                        onChange={(e) => setSupportReplyText(e.target.value)}
                        placeholder={t('adminSupport.replyPlaceholder')}
                        className="flex-1 h-20 rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm resize-none"
                      />
                      <button
                        type="button"
                        onClick={onSupportReply}
                        disabled={busy || !supportReplyText.trim()}
                        className="px-4 py-2.5 rounded-xl bg-cyan-500 text-zinc-950 text-sm font-black hover:bg-cyan-400 disabled:opacity-60"
                      >
                        {t('adminSupport.sendReply')}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 grid place-items-center text-zinc-500 text-sm">{t('adminSupport.selectTicket')}</div>
              )}
            </div>
          </div>
        )}

        {/* ===== PAYMENTS TAB ===== */}
        {activeTab === 'payments' && (
          <div className="space-y-5 animate-fade-up">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Pending</p>
                <p className="text-xl font-bold text-amber-400">{paymentStats.pending}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Completed</p>
                <p className="text-xl font-bold text-emerald-400">{paymentStats.completed}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Failed</p>
                <p className="text-xl font-bold text-red-400">{paymentStats.failed}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Cancelled</p>
                <p className="text-xl font-bold text-zinc-400">{paymentStats.cancelled}</p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-[10px] font-bold uppercase text-amber-200 mb-1">Total Revenue</p>
                <p className="text-xl font-bold text-amber-300">{paymentStats.totalRevenue.toLocaleString()} usd</p>
              </div>
            </div>

            {/* Payments List */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <span>💰</span> Payment Transactions
                  {paymentStats.awaitingNotification > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {paymentStats.awaitingNotification} new
                    </span>
                  )}
                </h3>
                <button
                  onClick={() => loadPayments()}
                  disabled={paymentsLoading}
                  className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-50"
                >
                  <svg className={`w-4 h-4 ${paymentsLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-950/50 text-zinc-500">
                    <tr>
                      <th className="text-left px-4 py-3 font-bold text-[11px] uppercase">Transaction ID</th>
                      <th className="text-left px-4 py-3 font-bold text-[11px] uppercase">User</th>
                      <th className="text-left px-4 py-3 font-bold text-[11px] uppercase">Plan</th>
                      <th className="text-left px-4 py-3 font-bold text-[11px] uppercase">Amount</th>
                      <th className="text-left px-4 py-3 font-bold text-[11px] uppercase">Status</th>
                      <th className="text-left px-4 py-3 font-bold text-[11px] uppercase">Date</th>
                      <th className="text-left px-4 py-3 font-bold text-[11px] uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-zinc-500">
                          <div className="text-4xl mb-2">💰</div>
                          <p>No payments yet</p>
                        </td>
                      </tr>
                    ) : payments.map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3">
                          <code className="text-xs bg-zinc-950 px-2 py-1 rounded text-cyan-400">{p.transactionId}</code>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {p.user?.avatar && (
                              <img src={p.user.avatar} alt="" className="w-6 h-6 rounded-full" />
                            )}
                            <span className="font-medium">{p.user?.username || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-300">{p.planTitle}</td>
                        <td className="px-4 py-3 font-bold">
                          {p.amount?.toLocaleString()} {p.currency}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${
                            p.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                            p.status === 'pending' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                            p.status === 'failed' ? 'bg-red-500/15 text-red-300 border-red-500/30' :
                            'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
                          }`}>
                            {p.status}
                          </span>
                          {!p.adminNotified && p.status === 'completed' && (
                            <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-amber-500 text-zinc-950 font-bold">NEW</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-xs">
                          {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : new Date(p.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          {!p.adminNotified && (
                            <button
                              onClick={() => onNotifyPayment(p.id)}
                              disabled={busy}
                              className="text-xs px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 disabled:opacity-50"
                            >
                              Mark Seen
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
