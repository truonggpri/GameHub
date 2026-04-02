import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

const CATEGORY_OPTIONS = [
  { value: 'vip', labelKey: 'support.categories.vip' },
  { value: 'game', labelKey: 'support.categories.game' },
  { value: 'billing', labelKey: 'support.categories.billing' },
  { value: 'account', labelKey: 'support.categories.account' },
  { value: 'other', labelKey: 'support.categories.other' }
];

const STATUS_OPTIONS = [
  { value: 'open', labelKey: 'support.status.open' },
  { value: 'pending', labelKey: 'support.status.pending' },
  { value: 'resolved', labelKey: 'support.status.resolved' },
  { value: 'closed', labelKey: 'support.status.closed' }
];

const statusTone = {
  open: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  pending: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  resolved: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
  closed: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300'
};

const formatDateTime = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function Support() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newTicket, setNewTicket] = useState({ subject: '', category: 'vip', message: '', gameId: '' });
  const [replyText, setReplyText] = useState('');
  const lastTicketMapRef = useRef(new Map());

  const api = useMemo(() => {
    const instance = axios.create({ baseURL: 'http://localhost:5000/api' });
    instance.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
    return instance;
  }, []);

  const isStaff = user && ['admin', 'mod'].includes(user.role);

  const selectedTicket = tickets.find((item) => item.id === selectedTicketId) || null;

  const loadTickets = async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setBusy(true);
        setError('');
      }
      const res = await api.get('/support/tickets');
      const items = Array.isArray(res.data) ? res.data : [];

      const nextMap = new Map(items.map((item) => [item.id, item.lastMessageAt]));
      const prevMap = lastTicketMapRef.current;
      const hasNewMessage = items.some((item) => {
        const prevAt = prevMap.get(item.id);
        const nextAt = item.lastMessageAt;
        if (!prevAt || !nextAt || prevAt === nextAt) return false;
        const lastRole = item?.lastMessage?.senderRole;
        if (isStaff) {
          return lastRole === 'user';
        }
        return lastRole === 'admin' || lastRole === 'mod';
      });
      if (hasNewMessage) {
        setSuccess(isStaff ? t('support.newMessageFromUser') : t('support.adminReplied'));
      }
      lastTicketMapRef.current = nextMap;

      setTickets(items);
      setSelectedTicketId((prev) => {
        if (prev && items.some((item) => item.id === prev)) return prev;
        return items[0]?.id || '';
      });
    } catch (err) {
      if (!silent) {
        setError(err?.response?.data?.message || t('support.loadError'));
      }
    } finally {
      if (!silent) {
        setBusy(false);
      }
    }
  };

  useEffect(() => {
    if (!loading && user) {
      loadTickets();
    }
  }, [loading, user]);

  useEffect(() => {
    if (loading || !user) return undefined;
    const timer = window.setInterval(() => {
      loadTickets({ silent: true });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [loading, user, isStaff]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(''), 2400);
    return () => window.clearTimeout(timer);
  }, [success]);

  const createTicket = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      setError('');
      const payload = {
        subject: newTicket.subject,
        category: newTicket.category,
        message: newTicket.message,
        gameId: newTicket.gameId
      };
      const res = await api.post('/support/tickets', payload);
      const created = res.data;
      setTickets((prev) => [created, ...prev]);
      setSelectedTicketId(created.id);
      setNewTicket({ subject: '', category: 'vip', message: '', gameId: '' });
      setSuccess(t('support.newTicketSuccess'));
    } catch (err) {
      setError(err?.response?.data?.message || t('support.createError'));
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    try {
      setBusy(true);
      setError('');
      const res = await api.post(`/support/tickets/${selectedTicket.id}/messages`, {
        content: replyText.trim()
      });
      const updated = res.data;
      setTickets((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setReplyText('');
      setSuccess(t('support.replySuccess'));
    } catch (err) {
      setError(err?.response?.data?.message || t('support.replyError'));
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (status) => {
    if (!selectedTicket || !isStaff) return;
    try {
      setBusy(true);
      setError('');
      const res = await api.patch(`/support/tickets/${selectedTicket.id}/status`, { status });
      const updated = res.data;
      setTickets((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSuccess(t('support.statusUpdated'));
    } catch (err) {
      setError(err?.response?.data?.message || t('support.statusError'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-zinc-950" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Navbar />
      <div className="container mx-auto px-4 md:px-6 pt-28 pb-12">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-300/80 font-bold">{t('support.title')}</p>
            <h1 className="text-3xl font-black tracking-tight">{t('support.title')}</h1>
            <p className="text-sm text-zinc-400 mt-1">{t('support.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={loadTickets}
            disabled={busy}
            className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold hover:bg-zinc-800 transition-colors disabled:opacity-60"
          >
            {t('support.reload')}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">{error}</div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-sm">{success}</div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
          <aside className="space-y-4">
            <form onSubmit={createTicket} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-3">
              <h2 className="text-sm font-black uppercase tracking-[0.12em] text-zinc-300">{t('support.createTicket')}</h2>
              <input
                value={newTicket.subject}
                onChange={(e) => setNewTicket((prev) => ({ ...prev, subject: e.target.value }))}
                className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                placeholder={t('support.subjectPlaceholder')}
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newTicket.category}
                  onChange={(e) => setNewTicket((prev) => ({ ...prev, category: e.target.value }))}
                  className="rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                >
                  {CATEGORY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{t(item.labelKey)}</option>
                  ))}
                </select>
                <input
                  value={newTicket.gameId}
                  onChange={(e) => setNewTicket((prev) => ({ ...prev, gameId: e.target.value }))}
                  className="rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                  placeholder={t('support.gameIdPlaceholder')}
                />
              </div>
              <textarea
                value={newTicket.message}
                onChange={(e) => setNewTicket((prev) => ({ ...prev, message: e.target.value }))}
                className="w-full h-24 rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm resize-none"
                placeholder={t('support.messagePlaceholder')}
                required
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-xl bg-cyan-500 text-zinc-950 text-sm font-black hover:bg-cyan-400 transition-colors disabled:opacity-60"
              >
                {t('support.sendTicket')}
              </button>
            </form>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 max-h-[520px] overflow-y-auto space-y-2">
              {tickets.length === 0 ? (
                <p className="text-sm text-zinc-500 px-1 py-2">{t('support.noTickets')}</p>
              ) : tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={`w-full text-left rounded-xl border p-3 transition-colors ${selectedTicketId === ticket.id ? 'border-cyan-400/40 bg-cyan-500/10' : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-white line-clamp-1">{ticket.subject}</p>
                    <span className={`px-1.5 py-0.5 rounded-md border text-[10px] font-bold uppercase ${statusTone[ticket.status] || statusTone.open}`}>{t(STATUS_OPTIONS.find((s) => s.value === ticket.status)?.labelKey)}</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">{formatDateTime(ticket.lastMessageAt)}</p>
                  {isStaff && ticket.user?.username && (
                    <p className="text-[11px] text-zinc-400 mt-1">{t('support.user')}: {ticket.user.username}</p>
                  )}
                </button>
              ))}
            </div>
          </aside>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 min-h-[620px] flex flex-col">
            {selectedTicket ? (
              <>
                <div className="p-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black text-white">{selectedTicket.subject}</h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      {CATEGORY_OPTIONS.find((item) => item.value === selectedTicket.category)?.label || selectedTicket.category}
                      {' • '}
                      {formatDateTime(selectedTicket.createdAt)}
                      {isStaff && selectedTicket.user?.username ? ` • ${selectedTicket.user.username}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isStaff && (
                      <select
                        value={selectedTicket.status}
                        onChange={(e) => updateStatus(e.target.value)}
                        className="rounded-lg bg-zinc-950 border border-zinc-700 px-2.5 py-2 text-xs font-bold uppercase"
                        disabled={busy}
                      >
                        {STATUS_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>{t(item.labelKey)}</option>
                        ))}
                      </select>
                    )}
                    <span className={`px-2 py-1 rounded-md border text-[11px] font-bold uppercase ${statusTone[selectedTicket.status] || statusTone.open}`}>{t(STATUS_OPTIONS.find((s) => s.value === selectedTicket.status)?.labelKey)}</span>
                    {isStaff && (
                      <button
                        type="button"
                        onClick={() => updateStatus('closed')}
                        disabled={busy}
                        className="px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 text-xs font-bold hover:bg-zinc-800 transition-colors disabled:opacity-60"
                      >
                        {t('support.closeTicket')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {selectedTicket.messages.map((msg) => {
                    const mine = msg.sender?._id === user._id || msg.sender?._id === user.id;
                    return (
                      <div key={msg.id} className={`max-w-[80%] rounded-xl px-3 py-2 border text-sm ${mine ? 'ml-auto bg-cyan-500 text-zinc-950 border-cyan-400/60' : 'mr-auto bg-zinc-950 text-zinc-200 border-zinc-700'}`}>
                        <div className={`text-[11px] mb-1 ${mine ? 'text-zinc-900/80' : 'text-zinc-500'}`}>
                          {msg.sender?.username || msg.senderRole} • {formatDateTime(msg.createdAt)}
                        </div>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-4 border-t border-zinc-800">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={t('support.replyPlaceholder')}
                      className="flex-1 h-20 rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm resize-none"
                    />
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={busy || !replyText.trim()}
                      className="px-4 py-2 rounded-xl bg-cyan-500 text-zinc-950 text-sm font-black hover:bg-cyan-400 transition-colors disabled:opacity-60"
                    >
                      {isStaff ? t('support.sendReply') : t('support.sendReply')}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 grid place-items-center text-zinc-500 text-sm">{t('support.selectTicket')}</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
