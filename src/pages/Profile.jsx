import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { useCustomGames } from '../context/CustomGamesContext';

const API_BASE_URL = 'http://localhost:5000/api';
const TELEMETRY_STORAGE_KEY = 'gamehub.embed.telemetry';

const createTelemetrySignature = (event = {}) => {
  const gameId = event?.gameId || '';
  const timestamp = event?.timestamp || '';
  const eventName = event?.eventName || '';
  const userId = event?.userId || '';
  return [userId, gameId, eventName, timestamp].join('|');
};

const mergeUniqueTelemetry = (primary = [], secondary = []) => {
  const next = [];
  const seen = new Set();

  [...primary, ...secondary].forEach((event) => {
    if (!event || typeof event !== 'object') return;
    const signature = createTelemetrySignature(event);
    if (seen.has(signature)) return;
    seen.add(signature);
    next.push(event);
  });

  return next;
};

const INITIAL_SUMMARY = {
  totalMatches: 0,
  totalScore: 0,
  bestScore: 0,
  averageScore: 0,
  recentAverageScore: 0,
  recentMatchesCount: 0,
  totalPlayTimeSeconds: 0,
  currentStreakDays: 0,
  longestStreakDays: 0,
  gamesPlayed: 0,
  topGames: [],
  lastActivityAt: null
};

const INITIAL_REVIEW_SUMMARY = {
  totalReviews: 0,
  averageRating: 0,
  breakdown: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0 }))
};

const REVIEW_SORT_OPTIONS = ['newest', 'oldest', 'highest', 'lowest'];

export default function Profile() {
  const { user, loading: authLoading, logout, updateProfile, uploadAvatar } = useAuth();
  const authUserId = user?._id || user?.id || '';
  const telemetryStorageKey = authUserId
    ? `${TELEMETRY_STORAGE_KEY}.${authUserId}`
    : TELEMETRY_STORAGE_KEY;
  const { customGames } = useCustomGames();
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(INITIAL_SUMMARY);
  const [embedTelemetry, setEmbedTelemetry] = useState([]);
  const [userReviews, setUserReviews] = useState([]);
  const [reviewsSummary, setReviewsSummary] = useState(INITIAL_REVIEW_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const [visibleActivities, setVisibleActivities] = useState(8);
  const [reloadCounter, setReloadCounter] = useState(0);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileNotice, setProfileNotice] = useState({ type: '', message: '' });
  const [profileForm, setProfileForm] = useState({ username: '', avatar: '' });
  const [reviewFilterStars, setReviewFilterStars] = useState('all');
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewSort, setReviewSort] = useState('newest');
  const [visibleReviews, setVisibleReviews] = useState(6);

  const favorites = Array.isArray(user?.favorites) ? user.favorites : [];

  const gameLookup = useMemo(() => {
    const map = new Map();
    customGames.forEach((game) => {
      const id = game._id || game.id;
      if (!id) return;
      map.set(id, {
        title: game.title || normalizeGameName(id),
        image: game.imageUrl || game.image || ''
      });
    });
    return map;
  }, [customGames]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let isCancelled = false;

    const fetchProfileData = async () => {
      setError('');
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const [historyRes, summaryRes, reviewsRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/scores/user/history?limit=40`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${API_BASE_URL}/scores/user/summary`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${API_BASE_URL}/games/reviews/me`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        if (isCancelled) return;
        setHistory(Array.isArray(historyRes.data) ? historyRes.data : []);
        setSummary({ ...INITIAL_SUMMARY, ...(summaryRes.data || {}) });
        setUserReviews(Array.isArray(reviewsRes.data?.reviews) ? reviewsRes.data.reviews : []);
        setReviewsSummary({ ...INITIAL_REVIEW_SUMMARY, ...(reviewsRes.data?.summary || {}) });
      } catch (fetchError) {
        if (isCancelled) return;
        if (fetchError?.response?.status === 401) {
          logout();
          return;
        }
        setError(fetchError?.response?.data?.message || 'Failed to fetch profile activity');
        setHistory([]);
        setSummary(INITIAL_SUMMARY);
        setUserReviews([]);
        setReviewsSummary(INITIAL_REVIEW_SUMMARY);
      } finally {
        if (!isCancelled) setRefreshing(false);
        if (!isCancelled) setLoading(false);
      }
    };

    fetchProfileData();
    return () => {
      isCancelled = true;
    };
  }, [user, logout, reloadCounter]);

  useEffect(() => {
    try {
      if (authUserId && telemetryStorageKey !== TELEMETRY_STORAGE_KEY) {
        const legacyRaw = JSON.parse(localStorage.getItem(TELEMETRY_STORAGE_KEY) || '[]');
        if (Array.isArray(legacyRaw) && legacyRaw.length > 0) {
          const migrateEvents = [];
          const remainLegacyEvents = [];

          legacyRaw.forEach((event) => {
            if (event?.userId && event.userId === authUserId) {
              migrateEvents.push(event);
            } else {
              remainLegacyEvents.push(event);
            }
          });

          if (migrateEvents.length > 0) {
            const scopedRaw = JSON.parse(localStorage.getItem(telemetryStorageKey) || '[]');
            const scopedSafeRaw = Array.isArray(scopedRaw) ? scopedRaw : [];
            const mergedScopedEvents = mergeUniqueTelemetry(scopedSafeRaw, migrateEvents).slice(0, 100);
            localStorage.setItem(telemetryStorageKey, JSON.stringify(mergedScopedEvents));
            localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(remainLegacyEvents));
          }
        }
      }

      const raw = JSON.parse(localStorage.getItem(telemetryStorageKey) || '[]');
      const safeRaw = Array.isArray(raw) ? raw : [];
      const scopedEvents = authUserId
        ? safeRaw.filter((event) => {
            const eventUserId = event?.userId;
            return !eventUserId || eventUserId === authUserId;
          })
        : safeRaw;
      setEmbedTelemetry(scopedEvents.slice(0, 30));
    } catch {
      setEmbedTelemetry([]);
    }
  }, [authUserId, telemetryStorageKey]);

  useEffect(() => {
    setVisibleActivities(8);
  }, [activityFilter]);

  useEffect(() => {
    setVisibleReviews(6);
  }, [reviewFilterStars, reviewSearch, reviewSort]);

  useEffect(() => {
    setProfileForm({
      username: user?.username || '',
      avatar: user?.avatar || ''
    });
  }, [user?.username, user?.avatar]);

  const scoreActivities = useMemo(
    () =>
      history.map((entry) => {
        const gameMeta = gameLookup.get(entry.gameId);
        return {
          id: entry._id,
          kind: 'match',
          gameId: entry.gameId,
          timestamp: entry.date,
          title: gameMeta?.title || normalizeGameName(entry.gameId),
          result: entry.result || 'completed',
          score: entry.score,
          durationSeconds: entry.durationSeconds || 0,
          activityType: entry.activityType || 'match_end'
        };
      }),
    [history, gameLookup]
  );

  const embedActivities = useMemo(
    () =>
      embedTelemetry.map((event, index) => {
        const gameMeta = gameLookup.get(event.gameId);
        return {
          id: `embed-${event.timestamp || index}-${event.eventName || 'event'}`,
          kind: 'embed',
          gameId: event.gameId,
          timestamp: event.timestamp,
          title: gameMeta?.title || event.title || normalizeGameName(event.gameId),
          eventName: event.eventName || 'event'
        };
      }),
    [embedTelemetry, gameLookup]
  );

  const allActivities = useMemo(
    () =>
      [...scoreActivities, ...embedActivities]
        .filter((item) => Boolean(item.timestamp))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [scoreActivities, embedActivities]
  );

  const filteredActivities = useMemo(() => {
    if (activityFilter === 'all') return allActivities;
    if (activityFilter === 'matches' || activityFilter === 'sessions') return allActivities.filter((item) => item.kind === 'match');
    if (activityFilter === 'embed') return allActivities.filter((item) => item.kind === 'embed');
    return allActivities;
  }, [allActivities, activityFilter]);

  const filteredUserReviews = useMemo(() => {
    const searchValue = reviewSearch.trim().toLowerCase();
    const byStars = userReviews.filter((review) => {
      if (reviewFilterStars === 'all') return true;
      return Number(review.rating) === Number(reviewFilterStars);
    });
    const bySearch = searchValue
      ? byStars.filter((review) => {
          const title = typeof review?.game?.title === 'string' ? review.game.title.toLowerCase() : '';
          const comment = typeof review?.comment === 'string' ? review.comment.toLowerCase() : '';
          return title.includes(searchValue) || comment.includes(searchValue);
        })
      : byStars;

    const sorted = [...bySearch];
    if (reviewSort === 'oldest') {
      sorted.sort((a, b) => new Date(a.updatedAt || a.createdAt).getTime() - new Date(b.updatedAt || b.createdAt).getTime());
    } else if (reviewSort === 'highest') {
      sorted.sort((a, b) => Number(b.rating) - Number(a.rating));
    } else if (reviewSort === 'lowest') {
      sorted.sort((a, b) => Number(a.rating) - Number(b.rating));
    } else {
      sorted.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
    }

    return sorted;
  }, [userReviews, reviewFilterStars, reviewSearch, reviewSort]);

  const visibleUserReviews = useMemo(() => filteredUserReviews.slice(0, visibleReviews), [filteredUserReviews, visibleReviews]);

  const displayedReviewsSummary = useMemo(() => {
    const totalReviews = filteredUserReviews.length;
    const averageRating = totalReviews > 0
      ? Number((filteredUserReviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) / totalReviews).toFixed(1))
      : 0;
    const breakdown = [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: filteredUserReviews.filter((item) => Number(item.rating) === stars).length
    }));
    return { totalReviews, averageRating, breakdown };
  }, [filteredUserReviews]);

  const fallbackCurrentStreakDays = useMemo(() => calculateActivityStreak(history), [history]);
  const fallbackLongestStreakDays = useMemo(() => calculateLongestActivityStreak(history), [history]);
  const currentStreakDays = Number.isFinite(summary.currentStreakDays) ? summary.currentStreakDays : fallbackCurrentStreakDays;
  const longestStreakDays = Number.isFinite(summary.longestStreakDays) ? summary.longestStreakDays : fallbackLongestStreakDays;
  const todayMatches = useMemo(() => countTodayMatches(history), [history]);
  const shownActivities = filteredActivities.slice(0, visibleActivities);
  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';
  const avatarUrl = typeof user?.avatar === 'string' && user.avatar.trim()
    ? user.avatar
    : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user?.username || 'player')}`;
  const hasVipFrame = Boolean(user?.isVip);
  const playerLevel = Math.max(1, Math.floor(summary.totalMatches / 8) + 1);
  const nextLevelTarget = playerLevel * 8;
  const previousLevelTarget = (playerLevel - 1) * 8;
  const levelProgressRaw = ((summary.totalMatches - previousLevelTarget) / Math.max(nextLevelTarget - previousLevelTarget, 1)) * 100;
  const levelProgress = Math.max(0, Math.min(100, Math.round(levelProgressRaw)));
  const rankTitle = getRankTitle(playerLevel);

  const getGameLink = (gameId) => {
    if (!gameId) return '/';
    return `/games/${String(gameId)}`;
  };

  const handleRefreshProfile = () => {
    setRefreshing(true);
    setReloadCounter((prev) => prev + 1);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileNotice({ type: '', message: '' });
    setProfileSaving(true);
    const result = await updateProfile(profileForm);
    if (result.success) {
      setProfileNotice({ type: 'success', message: 'Profile updated successfully.' });
      setProfileEditOpen(false);
    } else {
      setProfileNotice({ type: 'error', message: result.message || 'Unable to update profile' });
    }
    setProfileSaving(false);
  };

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileNotice({ type: '', message: '' });
    setAvatarUploading(true);
    const result = await uploadAvatar(file);
    if (result.success) {
      setProfileForm((prev) => ({ ...prev, avatar: result.avatarUrl || prev.avatar }));
      setProfileNotice({ type: 'success', message: 'Avatar uploaded successfully.' });
    } else {
      setProfileNotice({ type: 'error', message: result.message || 'Unable to upload avatar' });
    }
    setAvatarUploading(false);
    e.target.value = '';
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <Navbar />
        <div className="text-zinc-300">Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center">
        <Navbar />
        <h2 className="text-2xl font-bold mb-4">Please log in to view your profile</h2>
        <Link to="/login" className="px-6 py-2 bg-white text-black rounded-lg font-semibold hover:bg-zinc-200 transition-colors">
          Log In
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#06030f] via-[#090a1f] to-[#05060d] text-white font-sans animate-page-in">
      <Navbar />

      <div className="fixed inset-0 z-0 pointer-events-none opacity-70 bg-[radial-gradient(circle_at_10%_15%,rgba(236,72,153,0.26),transparent_32%),radial-gradient(circle_at_88%_18%,rgba(34,211,238,0.3),transparent_30%),radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.22),transparent_35%)] animate-fade-in animate-gradient-pan"></div>
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20 bg-grid-pattern"></div>
      <div className="fixed inset-0 z-0 pointer-events-none opacity-40 scanline-overlay"></div>

      <div className="container mx-auto px-6 pt-32 pb-12 relative z-10 space-y-8">
        <section className="relative overflow-hidden rounded-[30px] border border-fuchsia-400/25 bg-[linear-gradient(145deg,rgba(16,10,36,0.92),rgba(7,13,30,0.9))] backdrop-blur-md p-6 md:p-8 shadow-[0_0_50px_rgba(168,85,247,0.18)] animate-pop-in">
          <div className="absolute -top-28 -right-16 w-72 h-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="absolute -bottom-28 -left-20 w-72 h-72 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute top-8 right-10 text-[120px] font-black text-white/5 tracking-tight select-none">XP</div>

          <div className="relative grid grid-cols-1 lg:grid-cols-[auto,1fr,auto] gap-6 lg:gap-8 items-center">
            <div className="relative w-max">
              <div className="p-[3px] rounded-[26px] bg-gradient-to-br from-fuchsia-500 via-cyan-400 to-emerald-300 shadow-[0_0_35px_rgba(34,211,238,0.35)]">
                <div className={`relative w-28 h-28 rounded-3xl overflow-hidden bg-zinc-900 vip-avatar-frame ${hasVipFrame ? 'is-vip vip-avatar-frame--xl' : ''}`}>
                  <img src={avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                  {hasVipFrame && (
                    <>
                      <span className="vip-avatar-gem vip-avatar-gem--tl" />
                      <span className="vip-avatar-gem vip-avatar-gem--tr" />
                      <span className="vip-avatar-gem vip-avatar-gem--bl" />
                      <span className="vip-avatar-gem vip-avatar-gem--br" />
                      <span className="vip-avatar-crown vip-avatar-crown--xl">👑</span>
                    </>
                  )}
                </div>
              </div>
              <div className="absolute -right-3 -bottom-3 px-3 py-1 rounded-full text-[11px] font-black tracking-wide bg-zinc-950 border border-cyan-300/40 text-cyan-200">
                LV {playerLevel}
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-4xl md:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 via-cyan-200 to-emerald-200">
                  {user.username}
                </h1>
                <span className={`px-3 py-1 rounded-full border text-xs font-bold tracking-wide ${
                  user.role === 'admin'
                    ? 'text-amber-200 border-amber-400/40 bg-amber-500/15'
                    : user.role === 'mod'
                      ? 'text-emerald-200 border-emerald-400/40 bg-emerald-500/15'
                      : 'text-cyan-200 border-cyan-400/40 bg-cyan-500/15'
                }`}>
                  {user.role === 'admin' ? 'ADMIN' : user.role === 'mod' ? 'MOD' : 'USER'}
                </span>
                <span className="px-3 py-1 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200 text-xs font-bold tracking-wide">
                  {rankTitle}
                </span>
                {hasVipFrame && (
                  <span className="px-3 py-1 rounded-full border border-amber-300/45 bg-amber-500/15 text-amber-100 text-xs font-bold tracking-wide">
                    VIP FRAME
                  </span>
                )}
              </div>

              <div className="text-sm text-zinc-300/90 flex flex-wrap items-center gap-x-5 gap-y-1">
                <span>Member since: {memberSince}</span>
                <span>Last activity: {summary.lastActivityAt ? formatRelativeTime(summary.lastActivityAt) : 'No activity yet'}</span>
                {user.email && <span>{user.email}</span>}
              </div>

              <div className="mt-4 max-w-2xl">
                <div className="flex justify-between text-[11px] uppercase tracking-wider text-zinc-300 mb-1.5">
                  <span>Level Progress</span>
                  <span>{summary.totalMatches}/{nextLevelTarget} sessions</span>
                </div>
                <div className="h-3 rounded-full border border-fuchsia-400/20 bg-zinc-900/90 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-fuchsia-500 via-cyan-400 to-emerald-300 shadow-[0_0_18px_rgba(34,211,238,0.75)] transition-all duration-500"
                    style={{ width: `${levelProgress}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setProfileNotice({ type: '', message: '' });
                  setProfileEditOpen((prev) => !prev);
                }}
                className="px-5 py-2.5 rounded-xl border border-violet-400/30 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20 transition-colors font-semibold"
              >
                {profileEditOpen ? 'Close Edit' : 'Edit Profile'}
              </button>
              <button
                type="button"
                onClick={handleRefreshProfile}
                disabled={loading || refreshing}
                className="px-5 py-2.5 rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20 transition-colors font-semibold disabled:opacity-60"
              >
                {refreshing ? 'Refreshing...' : 'Refresh Data'}
              </button>
              <button
                onClick={logout}
                className="px-5 py-2.5 rounded-xl border border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 transition-colors font-semibold"
              >
                Log Out
              </button>
              <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-cyan-100/80">Today grind</div>
                <div className="text-lg font-black text-cyan-100">{todayMatches} sessions</div>
              </div>
            </div>
          </div>

          {profileNotice.message && (
            <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
              profileNotice.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/30 bg-red-500/10 text-red-200'
            }`}>
              {profileNotice.message}
            </div>
          )}

          {profileEditOpen && (
            <form onSubmit={handleSaveProfile} className="mt-5 rounded-2xl border border-white/10 bg-zinc-950/55 p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-zinc-400">Username</span>
                <input
                  type="text"
                  value={profileForm.username}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, username: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  maxLength={30}
                  required
                />
              </label>

              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-zinc-400">Avatar URL (optional)</span>
                <input
                  type="url"
                  value={profileForm.avatar}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, avatar: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="https://..."
                />
              </label>

              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-zinc-400">Upload avatar from device</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleAvatarFileChange}
                  disabled={avatarUploading}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-500/20 file:px-3 file:py-1 file:text-cyan-100 hover:file:bg-cyan-500/30"
                />
                <p className="mt-1 text-[11px] text-zinc-500">PNG/JPG/WEBP/GIF, tối đa 3MB.</p>
              </label>

              <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 flex items-center gap-3">
                <div className={`relative w-11 h-11 rounded-lg overflow-hidden border border-zinc-600 vip-avatar-frame ${hasVipFrame ? 'is-vip vip-avatar-frame--sm' : ''}`}>
                  <img
                    src={profileForm.avatar || avatarUrl}
                    alt="Avatar preview"
                    className="w-full h-full object-cover"
                  />
                  {hasVipFrame && (
                    <>
                      <span className="vip-avatar-gem vip-avatar-gem--tl" />
                      <span className="vip-avatar-gem vip-avatar-gem--tr" />
                      <span className="vip-avatar-gem vip-avatar-gem--bl" />
                      <span className="vip-avatar-gem vip-avatar-gem--br" />
                      <span className="vip-avatar-crown vip-avatar-crown--sm">👑</span>
                    </>
                  )}
                </div>
                <div className="text-xs text-zinc-400">
                  <div className="font-semibold text-zinc-200">Avatar preview</div>
                  <div>{avatarUploading ? 'Uploading...' : hasVipFrame ? 'VIP frame active' : 'Ready'}</div>
                </div>
              </div>

              <button
                type="submit"
                disabled={profileSaving || avatarUploading}
                className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-bold transition-colors disabled:opacity-60"
              >
                {profileSaving ? 'Saving...' : 'Save'}
              </button>
            </form>
          )}
        </section>

        {error && <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300">{error}</div>}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-up" style={{ '--delay': '90ms' }}>
          <MetricCard icon="🎯" label="Sessions" value={summary.totalMatches} accent="text-cyan-100" tone="from-cyan-500/30 to-blue-500/10" />
          <MetricCard icon="" label="Current Streak" value={`${currentStreakDays}d`} accent="text-orange-100" tone="from-orange-500/30 to-rose-500/10" />
          <MetricCard icon="🏅" label="Longest Streak" value={`${longestStreakDays}d`} accent="text-pink-100" tone="from-pink-500/30 to-fuchsia-500/10" />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 rounded-3xl border border-cyan-400/20 bg-[linear-gradient(150deg,rgba(15,17,37,0.95),rgba(16,12,30,0.9))] backdrop-blur-sm p-5 md:p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)] animate-fade-up" style={{ '--delay': '130ms' }}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-fuchsia-200">
                  BATTLE LOG
                </h2>
                <p className="text-xs text-zinc-400 uppercase tracking-wider">Recent gameplay & embed actions</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {['all', 'sessions', 'embed'].map((filterKey) => (
                  <button
                    key={filterKey}
                    onClick={() => setActivityFilter(filterKey)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                      activityFilter === filterKey
                        ? 'bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-zinc-950 border-transparent shadow-[0_0_14px_rgba(34,211,238,0.45)]'
                        : 'text-zinc-300 border-zinc-600 hover:border-cyan-400/50 hover:text-cyan-100'
                    }`}
                  >
                    {filterLabel(filterKey)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {loading ? (
                <div className="text-zinc-400 py-10 text-center">Loading activity...</div>
              ) : shownActivities.length > 0 ? (
                shownActivities.map((activity, index) => (
                  <div
                    key={activity.id}
                    className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-zinc-900/90 to-zinc-800/50 p-4 hover:border-cyan-400/40 transition-all animate-card-enter"
                    style={{ '--delay': `${Math.min(index, 8) * 55}ms` }}
                  >
                    <div className={`absolute left-0 top-0 h-full w-1 ${activity.kind === 'match' ? 'bg-gradient-to-b from-fuchsia-500 to-cyan-400' : 'bg-gradient-to-b from-cyan-400 to-emerald-400'}`} />
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center text-base ${activity.kind === 'match' ? 'bg-fuchsia-500/15 border-fuchsia-400/40' : 'bg-cyan-500/15 border-cyan-400/40'}`}>
                          {activity.kind === 'match' ? '🎮' : '🛰️'}
                        </div>
                        <div>
                          <div className="font-semibold group-hover:text-cyan-100 transition-colors">{activity.title}</div>
                          <div className="text-xs text-zinc-500">{new Date(activity.timestamp).toLocaleString()} • {formatRelativeTime(activity.timestamp)}</div>
                        </div>
                      </div>

                      {activity.kind === 'match' ? (
                        <span className={`px-2.5 py-1 text-xs rounded-full border uppercase ${resultBadgeClass(activity.result)}`}>
                          {activity.result || 'completed'}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-xs rounded-full border border-cyan-400/40 bg-cyan-500/15 text-cyan-200 uppercase">
                          Embed
                        </span>
                      )}
                    </div>

                    {activity.kind === 'match' ? (
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <MiniStat label="Score" value={activity.score} valueClass="text-emerald-200" />
                        <MiniStat label="Duration" value={formatDuration(activity.durationSeconds)} />
                        <MiniStat label="Type" value={activity.activityType} />
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-200">{formatTelemetryEvent(activity.eventName)}</div>
                    )}

                    {activity.gameId && (
                      <div className="mt-3">
                        <Link
                          to={getGameLink(activity.gameId)}
                          className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-100 transition-colors"
                        >
                          View game →
                        </Link>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-zinc-400 text-center py-10">No activities yet. Start your next run!</div>
              )}
            </div>

            {visibleActivities < filteredActivities.length && (
              <div className="mt-5 text-center">
                <button
                  onClick={() => setVisibleActivities((prev) => prev + 8)}
                  className="px-5 py-2 rounded-lg border border-fuchsia-400/40 hover:border-cyan-300/60 text-zinc-100 hover:text-cyan-100 transition-colors"
                >
                  Load more
                </button>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-emerald-400/25 bg-[linear-gradient(150deg,rgba(10,27,28,0.82),rgba(10,16,31,0.92))] backdrop-blur-sm p-5 shadow-[0_0_35px_rgba(16,185,129,0.14)] animate-fade-up" style={{ '--delay': '180ms' }}>
              <h3 className="font-black mb-4 tracking-wide text-emerald-100">PERFORMANCE OVERVIEW</h3>
              <div className="space-y-4 text-sm">
                <ProgressRow
                  label="Daily Activity"
                  value={Math.min(todayMatches * 20, 100)}
                  suffix={`${todayMatches} sessions today`}
                  tone="bg-gradient-to-r from-cyan-400 to-blue-400"
                  showPercent={false}
                />
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <MiniStat label="Play Time" value={formatDuration(summary.totalPlayTimeSeconds)} valueClass="text-cyan-200" />
                  <MiniStat label="Games Played" value={summary.gamesPlayed} valueClass="text-violet-200" />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-amber-400/25 bg-[linear-gradient(150deg,rgba(38,24,10,0.86),rgba(18,16,34,0.92))] backdrop-blur-sm p-5 shadow-[0_0_35px_rgba(245,158,11,0.14)] animate-fade-up" style={{ '--delay': '205ms' }}>
              <h3 className="font-black mb-3 tracking-wide text-amber-100">YOUR REVIEWS</h3>

              <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                <MiniStat label="Total" value={displayedReviewsSummary.totalReviews} valueClass="text-amber-100" />
                <MiniStat label="Avg" value={displayedReviewsSummary.averageRating > 0 ? `${displayedReviewsSummary.averageRating} ★` : '—'} valueClass="text-amber-200" />
              </div>

              <div className="space-y-2 mb-3">
                <input
                  value={reviewSearch}
                  onChange={(e) => setReviewSearch(e.target.value)}
                  placeholder="Search game/comment..."
                  className="w-full rounded-lg border border-amber-500/25 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={reviewSort}
                    onChange={(e) => setReviewSort(REVIEW_SORT_OPTIONS.includes(e.target.value) ? e.target.value : 'newest')}
                    className="flex-1 rounded-lg border border-amber-500/25 bg-zinc-900/70 px-2.5 py-2 text-xs text-zinc-100"
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="highest">Highest rating</option>
                    <option value="lowest">Lowest rating</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {['all', 5, 4, 3, 2, 1].map((stars) => {
                    const key = String(stars);
                    const active = String(reviewFilterStars) === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setReviewFilterStars(key)}
                        className={`px-2 py-1 rounded-md border text-[10px] font-bold transition-colors ${
                          active
                            ? 'bg-amber-500/25 border-amber-300/45 text-amber-100'
                            : 'bg-zinc-900/60 border-zinc-700 text-zinc-300 hover:border-amber-400/40'
                        }`}
                      >
                        {stars === 'all' ? 'All' : `${stars}★`}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                {visibleUserReviews.length > 0 ? (
                  visibleUserReviews.map((review) => (
                    <Link
                      to={getGameLink(review?.game?.id)}
                      key={review.id}
                      className="block rounded-xl border border-white/10 bg-zinc-900/55 p-3 hover:border-amber-300/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-zinc-100 truncate">{review?.game?.title || 'Unknown game'}</div>
                          <div className="text-[11px] text-zinc-500">{formatRelativeTime(review.updatedAt || review.createdAt)}</div>
                        </div>
                        <div className="text-xs font-bold text-amber-300 shrink-0">{Number(review.rating) || 0}★</div>
                      </div>
                      {review.comment && (
                        <p className="mt-1 text-xs text-zinc-300 line-clamp-2">{review.comment}</p>
                      )}
                    </Link>
                  ))
                ) : (
                  <div className="text-zinc-400 text-sm">No reviews matched your filters.</div>
                )}
              </div>

              {visibleReviews < filteredUserReviews.length && (
                <div className="mt-3 text-center">
                  <button
                    onClick={() => setVisibleReviews((prev) => prev + 6)}
                    className="px-4 py-1.5 rounded-lg border border-amber-400/35 text-xs font-bold text-amber-100 hover:bg-amber-500/10 transition-colors"
                  >
                    Load more reviews
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-violet-400/25 bg-[linear-gradient(150deg,rgba(27,12,45,0.88),rgba(12,13,34,0.92))] backdrop-blur-sm p-5 shadow-[0_0_35px_rgba(168,85,247,0.15)] animate-fade-up" style={{ '--delay': '230ms' }}>
              <h3 className="font-black mb-4 tracking-wide text-violet-100">TOP PLAYED GAMES</h3>
              <div className="space-y-3">
                {summary.topGames?.length > 0 ? (
                  summary.topGames.map((game, index) => {
                    const gameMeta = gameLookup.get(game.gameId);
                    return (
                      <Link
                        to={getGameLink(game.gameId)}
                        key={game.gameId}
                        className="block rounded-xl border border-white/10 bg-zinc-900/50 p-3 hover:border-violet-300/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/20 text-violet-200 text-xs border border-violet-400/40">
                              {index + 1}
                            </span>
                            <span>{gameMeta?.title || normalizeGameName(game.gameId)}</span>
                          </div>
                          <div className="text-xs text-zinc-300">{game.plays} plays</div>
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="text-zinc-400 text-sm">No game data yet.</div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-pink-400/25 bg-[linear-gradient(150deg,rgba(42,11,33,0.85),rgba(16,13,32,0.92))] backdrop-blur-sm p-5 shadow-[0_0_35px_rgba(236,72,153,0.15)] animate-fade-up" style={{ '--delay': '280ms' }}>
              <h3 className="font-black mb-4 tracking-wide text-pink-100">FAVORITE GAMES</h3>
              <div className="space-y-3">
                {favorites.length > 0 ? (
                  favorites.map((gameId, index) => {
                    const gameMeta = gameLookup.get(gameId);
                    return (
                      <Link
                        to={getGameLink(gameId)}
                        key={gameId}
                        className="group block animate-fade-up"
                        style={{ '--delay': `${Math.min(index, 8) * 55}ms` }}
                      >
                        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 flex items-center gap-3 group-hover:border-pink-300/50 transition-colors">
                          <div className="w-10 h-10 rounded-lg bg-zinc-700 overflow-hidden flex items-center justify-center">
                            {gameMeta?.image ? (
                              <img src={gameMeta.image} alt={gameMeta.title} className="w-full h-full object-cover" />
                            ) : (
                              <span>🎮</span>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium group-hover:text-pink-100 transition-colors">{gameMeta?.title || normalizeGameName(gameId)}</div>
                            <div className="text-xs text-zinc-400">View details</div>
                          </div>
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="text-zinc-400 text-sm">No favorites yet. Add some from Home page.</div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, accent, tone }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${tone || 'from-zinc-800/60 to-zinc-900/40'} p-4 shadow-[0_0_20px_rgba(0,0,0,0.22)] hover:-translate-y-0.5 transition-transform`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-[0.18em] text-zinc-300">{label}</div>
        {icon && <span className="text-sm">{icon}</span>}
      </div>
      <div className={`text-2xl font-black tracking-tight ${accent}`}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, valueClass = 'text-zinc-100' }) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`font-semibold text-sm ${valueClass}`}>{value}</div>
    </div>
  );
}

function ProgressRow({ label, value, suffix, tone, showPercent = true }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      <div className="flex justify-between text-xs text-zinc-400 mb-1">
        <span>{label}</span>
        <span>{suffix || (showPercent ? `${clamped}%` : clamped)}</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800/80 border border-white/10 overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

function isWinningResult(result) {
  return result === 'win' || result === 'x' || result === 'o';
}

function countTodayMatches(history) {
  const today = new Date();
  return history.filter((entry) => {
    const date = new Date(entry.date);
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }).length;
}

function calculateActivityStreak(history) {
  if (!Array.isArray(history) || history.length === 0) return 0;
  const daySet = new Set(
    history.map((entry) => {
      const date = new Date(entry.date);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    })
  );
  let streak = 0;
  let cursor = new Date();
  while (true) {
    const dayKey = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()).getTime();
    if (!daySet.has(dayKey)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function calculateLongestActivityStreak(history) {
  if (!Array.isArray(history) || history.length === 0) return 0;
  const uniqueDays = Array.from(new Set(
    history.map((entry) => {
      const date = new Date(entry.date);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    })
  )).sort((a, b) => a - b);

  if (uniqueDays.length === 0) return 0;

  let longest = 1;
  let running = 1;
  for (let i = 1; i < uniqueDays.length; i += 1) {
    if (uniqueDays[i] - uniqueDays[i - 1] === 86400000) {
      running += 1;
      if (running > longest) longest = running;
    } else {
      running = 1;
    }
  }
  return longest;
}

function getRankTitle(level) {
  if (level >= 26) return 'MYTHIC OVERLORD';
  if (level >= 20) return 'DIAMOND COMMANDER';
  if (level >= 14) return 'PLATINUM STRIKER';
  if (level >= 9) return 'GOLD HUNTER';
  if (level >= 5) return 'SILVER RAIDER';
  return 'ROOKIE';
}

function normalizeGameName(value) {
  if (!value) return 'Unknown game';
  if (/^[a-f0-9]{24}$/i.test(value)) return `Game #${value.slice(-6)}`;
  return value.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatDuration(seconds) {
  const safeSeconds = Number(seconds) || 0;
  if (safeSeconds <= 0) return '0m';
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 1)}m`;
}

function formatRelativeTime(value) {
  if (!value) return 'just now';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'just now';
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(value).toLocaleDateString();
}

function filterLabel(filterKey) {
  if (filterKey === 'all') return 'All';
  if (filterKey === 'matches' || filterKey === 'sessions') return 'Sessions';
  if (filterKey === 'wins') return 'Wins';
  if (filterKey === 'losses') return 'Losses';
  if (filterKey === 'embed') return 'Embed';
  return filterKey;
}

function resultBadgeClass(result) {
  if (isWinningResult(result)) return 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
  if (result === 'lose') return 'text-red-300 border-red-500/30 bg-red-500/10';
  if (result === 'draw') return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
  return 'text-zinc-300 border-zinc-600 bg-zinc-700/20';
}

function formatTelemetryEvent(eventName) {
  if (eventName === 'iframe_load_success') return 'Embedded game loaded successfully.';
  if (eventName === 'iframe_timeout') return 'Game loading timed out.';
  if (eventName === 'iframe_retry_clicked') return 'Retried loading game.';
  if (eventName === 'fullscreen_entered') return 'Entered fullscreen mode.';
  if (eventName === 'fullscreen_exited') return 'Exited fullscreen mode.';
  if (eventName === 'open_new_tab_clicked') return 'Opened game in a new tab.';
  if (eventName === 'session_end') return 'Finished a game session.';
  return eventName ? eventName.replace(/_/g, ' ') : 'Embed interaction';
}
