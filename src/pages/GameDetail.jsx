import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import { useCustomGames } from '../context/CustomGamesContext';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const COMMENTS_PAGE_SIZE = 6;
const DEFAULT_BREAKDOWN = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0 }));
const REVIEW_SORT_OPTIONS = ['newest', 'oldest', 'highest', 'lowest'];
const DEFAULT_COMMENTS_PAGINATION = {
  page: 1, limit: COMMENTS_PAGE_SIZE, total: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false
};

const difficultyConfig = {
  Easy:   { color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/25', icon: '🟢' },
  Medium: { color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/25',   icon: '🟡' },
  Hard:   { color: 'text-orange-400',  bg: 'bg-orange-500/15',  border: 'border-orange-500/25',  icon: '🟠' },
  Expert: { color: 'text-red-400',     bg: 'bg-red-500/15',     border: 'border-red-500/25',     icon: '🔴' },
};

const normalizeBreakdown = (rawBreakdown) => {
  if (!Array.isArray(rawBreakdown)) return DEFAULT_BREAKDOWN;
  const map = new Map(rawBreakdown.map((item) => [Number(item.stars), Number(item.count) || 0]));
  return [5, 4, 3, 2, 1].map((stars) => ({ stars, count: map.get(stars) || 0 }));
};

const formatRelativeTime = (value, t) => {
  if (!value) return t('gameDetail.relativeTime.justNow');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('gameDetail.relativeTime.justNow');
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t('gameDetail.relativeTime.justNow');
  if (minutes < 60) return t('gameDetail.relativeTime.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('gameDetail.relativeTime.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('gameDetail.relativeTime.daysAgo', { count: days });
  return date.toLocaleDateString('en-US');
};

const formatDate = (d) => {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const normalizePagination = (rawPagination, fallbackLimit = COMMENTS_PAGE_SIZE) => ({
  page: Number(rawPagination?.page) || 1,
  limit: Number(rawPagination?.limit) || fallbackLimit,
  total: Number(rawPagination?.total) || 0,
  totalPages: Number(rawPagination?.totalPages) || 1,
  hasNextPage: Boolean(rawPagination?.hasNextPage),
  hasPrevPage: Boolean(rawPagination?.hasPrevPage)
});

const normalizeTagValue = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
};

const resolveGameTags = (game) => {
  if (!game) return [];
  const sourceTags = Array.isArray(game.tags) && game.tags.length > 0 ? game.tags : [game.category, game.difficulty];
  const unique = [];
  const seen = new Set();
  for (const item of sourceTags) {
    const normalized = normalizeTagValue(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique.slice(0, 8);
};

export default function GameDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { customGames } = useCustomGames();
  const { user } = useAuth();
  const [gameDetail, setGameDetail] = useState(null);
  const [reviewSummary, setReviewSummary] = useState({ averageRating: 0, totalRatings: 0, breakdown: DEFAULT_BREAKDOWN });
  const [comments, setComments] = useState([]);
  const [commentsPagination, setCommentsPagination] = useState(DEFAULT_COMMENTS_PAGINATION);
  const [commentsSort, setCommentsSort] = useState('newest');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState('');
  const [myReview, setMyReview] = useState(null);
  const [draftRating, setDraftRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [draftComment, setDraftComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [editTargetId, setEditTargetId] = useState('');
  const [editDrafts, setEditDrafts] = useState({});
  const [editSubmitLoadingId, setEditSubmitLoadingId] = useState('');
  const [likeLoadingId, setLikeLoadingId] = useState('');
  const [replyTargetId, setReplyTargetId] = useState('');
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replySubmitLoadingId, setReplySubmitLoadingId] = useState('');
  const [reviews, setReviews] = useState([]);
  const [reviewsPagination, setReviewsPagination] = useState(DEFAULT_COMMENTS_PAGINATION);
  const [reviewsSort, setReviewsSort] = useState('newest');
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState('');

  const game = gameDetail || customGames.find((item) => (item._id || item.id) === id);
  const gameId = game?._id || game?.id || id;
  const gameUrl = game?.url || game?.embedUrl;
  const canPlay = typeof gameUrl === 'string' && gameUrl.trim() !== '';
  const vipLocked = Boolean(game?.vipLocked || (game?.vipOnly && !user?.isVip && !canPlay));
  const image = game?.imageUrl || game?.image || '';
  const averageRating = Number.isFinite(Number(reviewSummary.averageRating)) ? Number(reviewSummary.averageRating) : Number(game?.rating) || 0;
  const averageDisplay = Math.max(0, Math.min(5, Number(averageRating.toFixed(1))));
  const totalRatings = Number.isFinite(Number(reviewSummary.totalRatings)) ? Number(reviewSummary.totalRatings) : 0;
  const playCount = Number.isFinite(Number(game?.playCount)) ? Number(game.playCount) : 0;
  const likeCount = Number.isFinite(Number(game?.likeCount)) ? Number(game.likeCount) : 0;
  const currentUserId = user?._id || user?.id || null;
  const ratingBreakdown = useMemo(() => normalizeBreakdown(reviewSummary.breakdown), [reviewSummary.breakdown]);
  const gameTags = useMemo(() => {
    const categoryTag = normalizeTagValue(game?.category);
    const difficultyTag = normalizeTagValue(game?.difficulty);
    return resolveGameTags(game).filter((tag) => tag !== categoryTag && tag !== difficultyTag);
  }, [game]);

  const category = game?.category || '';
  const difficulty = game?.difficulty || '';
  const diffStyle = difficultyConfig[difficulty] || null;
  const publisher = game?.publisher || '';
  const players = game?.players || '';
  const controls = game?.controls || '';
  const version = game?.version || '';
  const addedDate = formatDate(game?.createdAt);

  const infoItems = [];
  if (publisher)  infoItems.push({ icon: '🏢', label: t('gameDetail.infoLabels.publisher'), value: publisher });
  if (players)    infoItems.push({ icon: '👥', label: t('gameDetail.infoLabels.players'), value: players });
  if (controls)   infoItems.push({ icon: '🎮', label: t('gameDetail.infoLabels.controls'), value: controls });
  if (version)    infoItems.push({ icon: '📦', label: t('gameDetail.infoLabels.version'), value: version });
  if (category)   infoItems.push({ icon: '📂', label: t('gameDetail.infoLabels.category'), value: category });
  if (difficulty)  infoItems.push({ icon: diffStyle?.icon || '⚡', label: t('gameDetail.infoLabels.difficulty'), value: difficulty });
  if (addedDate)  infoItems.push({ icon: '📅', label: t('gameDetail.infoLabels.added'), value: addedDate });

  const getAuthConfig = (config = {}) => {
    const token = localStorage.getItem('token');
    if (!token) return config;
    return { ...config, headers: { ...(config.headers || {}), Authorization: `Bearer ${token}` } };
  };

  const loadGameDetail = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError('');
      const res = await axios.get(`${API_BASE_URL}/games/${id}`, getAuthConfig({ params: { reviewLimit: COMMENTS_PAGE_SIZE, reviewSort: commentsSort } }));
      const payload = res.data;
      setGameDetail(payload);
      if (Array.isArray(payload.reviews)) setReviews(payload.reviews);
      if (payload.reviewsPagination) setReviewsPagination(normalizePagination(payload.reviewsPagination));
      setReviewSummary({
        averageRating: Number(payload.reviewSummary?.averageRating) || 0,
        totalRatings: Number(payload.reviewSummary?.totalRatings) || 0,
        breakdown: normalizeBreakdown(payload.reviewSummary?.breakdown)
      });
      const incomingMyReview = payload.myReview || null;
      setMyReview(incomingMyReview);
      if (incomingMyReview) {
        setDraftRating(Number(incomingMyReview.rating) || 0);
        setDraftComment(incomingMyReview.comment || '');
      } else {
        setDraftRating(0);
        setDraftComment('');
      }
    } catch (err) {
      setError(err?.response?.data?.message || t('gameDetail.loadError'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadComments = async ({ page = 1, sort = commentsSort } = {}) => {
    try {
      setCommentsLoading(true);
      setCommentsError('');
      const res = await axios.get(`${API_BASE_URL}/games/${id}/comments`, { params: { page, limit: COMMENTS_PAGE_SIZE, sort } });
      const payload = res.data;
      setComments(Array.isArray(payload.comments) ? payload.comments : []);
      setCommentsPagination(normalizePagination(payload.pagination));
    } catch (err) {
      setCommentsError(err?.response?.data?.message || t('gameDetail.comments.loadingFailed'));
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => { loadGameDetail(); }, [id, user?._id, user?.id]);
  useEffect(() => { loadComments({ page: 1, sort: commentsSort }); }, [id, commentsSort]);
  useEffect(() => { loadReviews({ page: 1, sort: reviewsSort }); }, [id, reviewsSort]);

  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(''), 4000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  const handleLikeComment = async (commentId) => {
    if (!user) { setError(t('gameDetail.comments.loginRequired')); return; }
    try {
      setLikeLoadingId(commentId);
      await axios.post(`${API_BASE_URL}/games/${id}/comments/${commentId}/like`, {}, getAuthConfig());
      await loadComments({ page: commentsPagination.page, sort: commentsSort });
    } catch (err) {
      setError(err?.response?.data?.message || t('gameDetail.comments.likeError'));
    } finally {
      setLikeLoadingId('');
    }
  };

  const handleEditChange = (commentId, value) => {
    setEditDrafts((prev) => ({ ...prev, [commentId]: value }));
  };

  const handleToggleEdit = (comment) => {
    const commentId = comment.id;
    if (editTargetId === commentId) {
      setEditTargetId('');
      return;
    }
    setEditTargetId(commentId);
    setEditDrafts((prev) => ({ ...prev, [commentId]: comment.content || '' }));
  };

  const handleSubmitEdit = async (commentId) => {
    if (!user) { setError(t('gameDetail.comments.loginRequired')); return; }
    const content = editDrafts[commentId] || '';
    const trimmed = content.trim();
    if (!trimmed) { setError(t('gameDetail.comments.commentRequired')); return; }
    try {
      setEditSubmitLoadingId(commentId);
      await axios.put(`${API_BASE_URL}/games/${id}/comments/${commentId}`, { content: trimmed }, getAuthConfig());
      setEditTargetId('');
      setSuccessMessage(t('gameDetail.comments.editSuccess'));
      await loadComments({ page: commentsPagination.page, sort: commentsSort });
    } catch (err) {
      setError(err?.response?.data?.message || t('gameDetail.comments.editError'));
    } finally {
      setEditSubmitLoadingId('');
    }
  };

  const handleCancelEdit = () => {
    setEditTargetId('');
  };

  const handleDeleteComment = async (commentId) => {
    if (!user) { setError(t('gameDetail.comments.loginRequired')); return; }
    const confirmed = window.confirm(t('gameDetail.comments.deleteConfirm'));
    if (!confirmed) return;
    try {
      await axios.delete(`${API_BASE_URL}/games/${id}/comments/${commentId}`, getAuthConfig());
      setSuccessMessage(t('gameDetail.comments.deleteSuccess'));
      await loadComments({ page: commentsPagination.page, sort: commentsSort });
    } catch (err) {
      setError(err?.response?.data?.message || t('gameDetail.comments.deleteError'));
    }
  };

  const handleReplyChange = (commentId, value) => {
    setReplyDrafts((prev) => ({ ...prev, [commentId]: value }));
  };

  const handleToggleReply = (commentId) => {
    setReplyTargetId((current) => (current === commentId ? '' : commentId));
  };

  const handleCancelReply = () => {
    setReplyTargetId('');
  };

  const loadReviews = async ({ page = 1, sort = reviewsSort } = {}) => {
    try {
      setReviewsLoading(true);
      setReviewsError('');
      const res = await axios.get(`${API_BASE_URL}/games/${id}/reviews`, { params: { page, limit: COMMENTS_PAGE_SIZE, sort } });
      const payload = res.data;
      setReviews(Array.isArray(payload.comments) ? payload.comments : []);
      setReviewsPagination(normalizePagination(payload.pagination));
      if (payload.reviewSummary) {
        setReviewSummary({
          averageRating: Number(payload.reviewSummary?.averageRating) || 0,
          totalRatings: Number(payload.reviewSummary?.totalRatings) || 0,
          breakdown: normalizeBreakdown(payload.reviewSummary?.breakdown)
        });
      }
    } catch (err) {
      setReviewsError(err?.response?.data?.message || t('gameDetail.reviews.loadingFailed'));
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleSubmitReply = async (parentCommentId) => {
    if (!user) { setError(t('gameDetail.comments.loginRequired')); return; }
    const content = replyDrafts[parentCommentId] || '';
    const trimmed = content.trim();
    if (!trimmed) { setError(t('gameDetail.comments.commentRequired')); return; }
    try {
      setReplySubmitLoadingId(parentCommentId);
      await axios.post(`${API_BASE_URL}/games/${id}/comments`, { content: trimmed, parentComment: parentCommentId }, getAuthConfig());
      setReplyTargetId('');
      setReplyDrafts((prev) => ({ ...prev, [parentCommentId]: '' }));
      setSuccessMessage(t('gameDetail.comments.replySuccess'));
      await loadComments({ page: commentsPagination.page, sort: commentsSort });
    } catch (err) {
      setError(err?.response?.data?.message || t('gameDetail.comments.submitError'));
    } finally {
      setReplySubmitLoadingId('');
    }
  };

  const handleSubmitReview = async () => {
    setError('');
    setSuccessMessage('');
    if (!user) { setError(t('gameDetail.review.loginToSubmit')); return; }
    if (!Number.isInteger(draftRating) || draftRating < 1 || draftRating > 5) { setError(t('gameDetail.review.ratingRequired')); return; }
    if (!draftComment.trim()) { setError(t('gameDetail.review.commentRequired')); return; }
    try {
      setSubmitLoading(true);
      const isUpdating = Boolean(myReview);
      await axios.post(`${API_BASE_URL}/games/${id}/reviews`, { rating: draftRating, comment: draftComment.trim() }, getAuthConfig());
      setSuccessMessage(isUpdating ? t('gameDetail.review.updated') : t('gameDetail.review.submitted'));
      await Promise.all([loadGameDetail({ silent: true }), loadReviews({ page: 1, sort: reviewsSort })]);
    } catch (err) {
      setError(err?.response?.data?.message || t('gameDetail.review.submitFailed'));
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteReview = async () => {
    setError('');
    setSuccessMessage('');
    if (!user) { setError(t('gameDetail.review.loginToDelete')); return; }
    if (!myReview) { setError(t('gameDetail.review.noReviewToDelete')); return; }
    const confirmed = window.confirm(t('gameDetail.review.deleteConfirm'));
    if (!confirmed) return;
    try {
      setDeleteLoading(true);
      await axios.delete(`${API_BASE_URL}/games/${id}/reviews/me`, getAuthConfig());
      setMyReview(null);
      setDraftRating(0);
      setDraftComment('');
      setSuccessMessage(t('gameDetail.review.deleted'));
      await Promise.all([loadGameDetail({ silent: true }), loadReviews({ page: 1, sort: reviewsSort })]);
    } catch (err) {
      setError(err?.response?.data?.message || t('gameDetail.review.deleteFailed'));
    } finally {
      setDeleteLoading(false);
    }
  };

  /* ---- Loading State ---- */
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center">
        <Navbar />
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-400 text-sm">{t('gameDetail.loading')}</span>
        </div>
      </div>
    );
  }

  /* ---- Not Found State ---- */
  if (!game) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center px-6">
        <Navbar />
        <div className="text-6xl mb-4">🎮</div>
        <h2 className="text-3xl font-black mb-3">{t('gameDetail.notFoundTitle')}</h2>
        <p className="text-zinc-400 mb-6 text-center max-w-md">{t('gameDetail.notFoundDesc')}</p>
        <Link to="/" className="px-6 py-3 rounded-xl bg-white text-black font-bold hover:bg-zinc-200 transition-colors">
          {t('gameDetail.backHome')}
        </Link>
      </div>
    );
  }

  const activeRating = hoverRating || draftRating;

  return (
    <div className="min-h-screen bg-zinc-950 text-white animate-page-in">
      <Navbar />

      {/* Ambient backgrounds */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,0.07),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.06),transparent_50%)]" />
      </div>

      {/* Hero Banner */}
      <div className="relative h-72 sm:h-80 md:h-96 overflow-hidden">
        {image ? (
          <img src={image} alt={game.title} className="absolute inset-0 w-full h-full object-cover scale-105 blur-sm" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-zinc-800" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-zinc-950/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/40 to-transparent" />

        <div className="relative z-10 container mx-auto px-4 md:px-6 h-full flex items-end pb-8">
          <div className="flex gap-5 md:gap-7 items-end w-full">
            {/* Game Thumbnail */}
            <div className="hidden sm:block shrink-0 w-32 md:w-40 lg:w-48 aspect-[3/4] rounded-2xl overflow-hidden border-2 border-white/15 shadow-2xl shadow-black/50 animate-fade-up" style={{ '--delay': '50ms' }}>
              {image ? (
                <img src={image} alt={game.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-4xl">🎮</div>
              )}
            </div>

            {/* Title + Meta */}
            <div className="flex-1 min-w-0 pb-1 animate-fade-up" style={{ '--delay': '100ms' }}>
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {category && (
                  <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-cyan-500/15 border border-cyan-500/25 text-cyan-300">{category}</span>
                )}
                {difficulty && diffStyle && (
                  <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg ${diffStyle.bg} border ${diffStyle.border} ${diffStyle.color}`}>
                    {diffStyle.icon} {difficulty}
                  </span>
                )}
                {averageDisplay > 0 && (
                  <span className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-400">
                    ★ {averageDisplay} · {t('gameDetail.ratingsCount', { count: totalRatings })}
                  </span>
                )}
                <span className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-cyan-500/15 border border-cyan-500/25 text-cyan-300">
                  ▶ {playCount} {t('gameCard.plays')}
                </span>
                <span className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-rose-500/15 border border-rose-500/25 text-rose-300">
                  ❤ {likeCount} {t('gameCard.likes')}
                </span>
                {canPlay && (
                  <span className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">{t('gameDetail.playable')}</span>
                )}
                {vipLocked && (
                  <span className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-300">VIP ONLY</span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight leading-tight mb-2 drop-shadow-lg">{game.title}</h1>

              {publisher && (
                <p className="text-sm text-zinc-400 mb-3">{t('gameDetail.by')} <span className="text-zinc-200 font-medium">{publisher}</span></p>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2.5 mt-1">
                {vipLocked ? (
                  <Link
                    to="/membership"
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all"
                  >
                    <span>👑</span>
                    Upgrade to VIP
                  </Link>
                ) : canPlay ? (
                  <Link
                    to={`/games/play/${gameId}`}
                    className="group inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    {t('gameDetail.playNow')}
                  </Link>
                ) : (
                  <button disabled className="px-6 py-2.5 rounded-xl font-bold bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700">
                    {t('gameDetail.notAvailable')}
                  </button>
                )}
                {canPlay && !vipLocked && (
                  <button
                    onClick={() => window.open(gameUrl, '_blank', 'noopener,noreferrer')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold border border-white/15 bg-white/5 hover:bg-white/10 text-zinc-200 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                    {t('gameDetail.openNewTab')}
                  </button>
                )}
              </div>
              {vipLocked && (
                <p className="mt-3 text-xs text-amber-200/90">
                  This game is reserved for VIP members. Purchase a VIP plan to play instantly.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 container mx-auto px-4 md:px-6 pb-16 -mt-2">

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 mt-6">

          {/* Left Column */}
          <div className="space-y-6">

            {/* Description + Info */}
            <div className="rounded-2xl border border-white/8 bg-zinc-900/60 backdrop-blur-sm p-5 md:p-7 animate-fade-up" style={{ '--delay': '120ms' }}>
              {/* Description */}
              {game.description && (
                <div className="mb-6">
                  <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                    <span className="text-cyan-400">📝</span> {t('gameDetail.intro')}
                  </h2>
                  <p className="text-zinc-300 leading-relaxed text-sm">{game.description}</p>
                </div>
              )}

              {/* Info Grid */}
              {infoItems.length > 0 && (
                <div>
                  <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                    <span className="text-cyan-400">ℹ️</span> {t('gameDetail.information')}
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {infoItems.map((item) => (
                      <div key={item.label} className="rounded-xl border border-white/8 bg-zinc-950/50 p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-sm">{item.icon}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{item.label}</span>
                        </div>
                        <p className="text-sm font-semibold text-zinc-100 truncate">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              {gameTags.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {gameTags.map((tag) => (
                    <Link
                      key={tag}
                      to={`/?tags=${encodeURIComponent(tag)}`}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-cyan-500/10 text-cyan-300/80 border border-cyan-500/15 hover:bg-cyan-500/20 hover:border-cyan-500/30 transition-all"
                    >
                      #{tag}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Write a Review */}
            <div className="rounded-2xl border border-white/8 bg-zinc-900/60 backdrop-blur-sm p-5 md:p-7 animate-fade-up" style={{ '--delay': '160ms' }}>
              <div className="flex items-center justify-between gap-3 mb-5">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <span className="text-cyan-400">✍️</span> {myReview ? t('gameDetail.review.updateTitle') : t('gameDetail.review.writeTitle')}
                </h2>
                {user && myReview && (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/20 text-cyan-300">{t('gameDetail.review.reviewed')}</span>
                )}
              </div>

              {error && (
                <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
                  <span>⚠️</span> {error}
                </div>
              )}
              {successMessage && (
                <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 flex items-center gap-2">
                  <span>✅</span> {successMessage}
                </div>
              )}

              {/* Star Picker */}
              <div className="mb-5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2 block">{t('gameDetail.review.yourRating')}</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setDraftRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      disabled={!user}
                      className={`text-3xl leading-none transition-all duration-150 hover:scale-110 disabled:cursor-not-allowed ${
                        activeRating >= star ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]' : 'text-zinc-700 hover:text-zinc-500'
                      }`}
                      aria-label={t('gameDetail.rateAria', { star })}
                    >
                      ★
                    </button>
                  ))}
                  {activeRating > 0 && (
                    <span className="ml-2 text-sm font-bold text-amber-400">{activeRating}/5</span>
                  )}
                </div>
              </div>

              {/* Comment Box */}
              <div className="mb-5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2 block">{t('gameDetail.review.comment')}</label>
                <textarea
                  value={draftComment}
                  onChange={(e) => setDraftComment(e.target.value)}
                  placeholder={user ? t('gameDetail.review.commentPlaceholder') : t('gameDetail.review.loginCommentPlaceholder')}
                  disabled={!user}
                  className="w-full h-28 rounded-xl border border-zinc-700/60 bg-zinc-950/60 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/30 transition-all resize-none disabled:opacity-50"
                />
                <div className="flex justify-end mt-1">
                  <span className={`text-[10px] ${draftComment.length > 500 ? 'text-red-400' : 'text-zinc-600'}`}>{draftComment.length}/500</span>
                </div>
              </div>

              {!user && (
                <p className="text-sm text-zinc-500 mb-4">
                  <Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-medium underline underline-offset-2">{t('gameDetail.review.loginToReview')}</Link>{t('gameDetail.review.loginToReviewSuffix')}
                </p>
              )}

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={handleSubmitReview}
                  disabled={submitLoading || deleteLoading || !user}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    submitLoading || deleteLoading || !user
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30'
                  }`}
                >
                  {submitLoading ? t('gameDetail.review.submitting') : myReview ? t('gameDetail.review.update') : t('gameDetail.review.submit')}
                </button>
                {user && myReview && (
                  <button
                    type="button"
                    onClick={handleDeleteReview}
                    disabled={deleteLoading || submitLoading}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold bg-zinc-800 text-red-400 border border-red-500/20 hover:bg-red-500/15 hover:border-red-500/30 transition-all disabled:opacity-50"
                  >
                    {deleteLoading ? t('gameDetail.review.deleting') : t('gameDetail.review.delete')}
                  </button>
                )}
              </div>
            </div>

            {/* Reviews List */}
            <div className="rounded-2xl border border-white/8 bg-zinc-900/60 backdrop-blur-sm p-5 md:p-7 animate-fade-up" style={{ '--delay': '180ms' }}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <span className="text-amber-400">⭐</span> {t('gameDetail.reviews.title')}
                  <span className="text-xs font-normal text-zinc-500 ml-1">{t('gameDetail.reviews.count', { count: reviewsPagination.total })}</span>
                </h2>
                <select
                  value={reviewsSort}
                  onChange={(e) => setReviewsSort(e.target.value)}
                  className="rounded-xl border border-zinc-700/60 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                >
                  {REVIEW_SORT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{t(`gameDetail.sort.${opt}`)}</option>
                  ))}
                </select>
              </div>

              {reviewsError && (
                <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {reviewsError}
                </div>
              )}

              {reviewsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-xl bg-zinc-800/40 h-24 animate-pulse" />
                  ))}
                </div>
              ) : reviews.length > 0 ? (
                <div className="space-y-3">
                  {reviews.map((review, index) => (
                    <ReviewCard
                      key={review.id}
                      review={review}
                      isMine={Boolean(currentUserId && review?.user?.id && String(review.user.id) === String(currentUserId))}
                      index={index}
                      t={t}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-3xl mb-2">⭐</div>
                  <p className="text-zinc-500 text-sm">{t('gameDetail.reviews.empty')}</p>
                </div>
              )}

              {reviewsPagination.totalPages > 1 && (
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => loadReviews({ page: reviewsPagination.page - 1, sort: reviewsSort })}
                    disabled={!reviewsPagination.hasPrevPage || reviewsLoading}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-30 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
                  >
                    {t('gameDetail.reviews.previous')}
                  </button>
                  <span className="text-xs text-zinc-500 font-medium">
                    {reviewsPagination.page} / {reviewsPagination.totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadReviews({ page: reviewsPagination.page + 1, sort: reviewsSort })}
                    disabled={!reviewsPagination.hasNextPage || reviewsLoading}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-30 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
                  >
                    {t('gameDetail.reviews.next')}
                  </button>
                </div>
              )}
            </div>

            {/* Comments List */}
            <div className="rounded-2xl border border-white/8 bg-zinc-900/60 backdrop-blur-sm p-5 md:p-7 animate-fade-up" style={{ '--delay': '200ms' }}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <span className="text-cyan-400">💬</span> {t('gameDetail.comments.title')}
                  <span className="text-xs font-normal text-zinc-500 ml-1">{t('gameDetail.comments.count', { count: commentsPagination.total })}</span>
                </h2>
                <select
                  value={commentsSort}
                  onChange={(e) => setCommentsSort(e.target.value)}
                  className="rounded-xl border border-zinc-700/60 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                >
                  {REVIEW_SORT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{t(`gameDetail.sort.${opt}`)}</option>
                  ))}
                </select>
              </div>

              {commentsError && (
                <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {commentsError}
                </div>
              )}

              {commentsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-xl bg-zinc-800/40 h-24 animate-pulse" />
                  ))}
                </div>
              ) : comments.length > 0 ? (
                <div className="space-y-3">
                  {comments.map((comment, index) => (
                    <CommentCard
                      key={comment.id}
                      comment={comment}
                      isMine={Boolean(currentUserId && comment?.user?.id && String(comment.user.id) === String(currentUserId))}
                      index={index}
                      currentUserId={currentUserId}
                      onLike={handleLikeComment}
                      onEdit={handleToggleEdit}
                      onDelete={handleDeleteComment}
                      onReply={handleToggleReply}
                      likeLoadingId={likeLoadingId}
                      editTargetId={editTargetId}
                      editDrafts={editDrafts}
                      onEditChange={handleEditChange}
                      onSubmitEdit={handleSubmitEdit}
                      onCancelEdit={handleCancelEdit}
                      editSubmitLoadingId={editSubmitLoadingId}
                      replyTargetId={replyTargetId}
                      replyDrafts={replyDrafts}
                      onReplyChange={handleReplyChange}
                      onSubmitReply={handleSubmitReply}
                      onCancelReply={handleCancelReply}
                      replySubmitLoadingId={replySubmitLoadingId}
                      t={t}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">💬</div>
                  <p className="text-zinc-500 text-sm">{t('gameDetail.comments.empty')}</p>
                </div>
              )}

              {commentsPagination.totalPages > 1 && (
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => loadComments({ page: commentsPagination.page - 1, sort: commentsSort })}
                    disabled={!commentsPagination.hasPrevPage || commentsLoading}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-30 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
                  >
                    {t('gameDetail.comments.previous')}
                  </button>
                  <span className="text-xs text-zinc-500 font-medium">
                    {commentsPagination.page} / {commentsPagination.totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadComments({ page: commentsPagination.page + 1, sort: commentsSort })}
                    disabled={!commentsPagination.hasNextPage || commentsLoading}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-30 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
                  >
                    {t('gameDetail.comments.next')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar */}
          <aside className="space-y-5">
            {/* Rating Summary */}
            <div className="rounded-2xl border border-white/8 bg-zinc-900/60 backdrop-blur-sm p-5 animate-fade-up" style={{ '--delay': '140ms' }}>
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <span className="text-amber-400">⭐</span> {t('gameDetail.sidebar.rating')}
              </h3>
              <div className="flex items-center gap-4 mb-5">
                <div className="text-center">
                  <div className="text-4xl font-black text-amber-400 leading-none">{averageDisplay}</div>
                  <StarRow value={averageDisplay} />
                  <p className="text-[10px] text-zinc-500 mt-1">{t('gameDetail.ratingsCount', { count: totalRatings })}</p>
                </div>
                <div className="flex-1 space-y-1.5">
                  {ratingBreakdown.map((item) => (
                    <RatingBar key={item.stars} stars={item.stars} count={item.count} total={totalRatings} />
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Info */}
            {(category || difficulty || canPlay) && (
              <div className="rounded-2xl border border-white/8 bg-zinc-900/60 backdrop-blur-sm p-5 animate-fade-up" style={{ '--delay': '180ms' }}>
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <span className="text-cyan-400">🎯</span> {t('gameDetail.sidebar.quickInfo')}
                </h3>
                <div className="space-y-3">
                  {category && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-500">{t('gameDetail.sidebar.category')}</span>
                      <span className="font-semibold text-zinc-200">{category}</span>
                    </div>
                  )}
                  {difficulty && diffStyle && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-500">{t('gameDetail.sidebar.difficulty')}</span>
                      <span className={`font-bold ${diffStyle.color}`}>{diffStyle.icon} {difficulty}</span>
                    </div>
                  )}
                  {players && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-500">{t('gameDetail.sidebar.players')}</span>
                      <span className="font-semibold text-zinc-200">{players}</span>
                    </div>
                  )}
                  {controls && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-500">{t('gameDetail.sidebar.controls')}</span>
                      <span className="font-semibold text-zinc-200">{controls}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500">{t('gameDetail.sidebar.status')}</span>
                    <span className={`font-bold ${canPlay ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      {canPlay ? t('gameDetail.sidebar.online') : t('gameDetail.sidebar.offline')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Tags Sidebar */}
            {gameTags.length > 0 && (
              <div className="rounded-2xl border border-white/8 bg-zinc-900/60 backdrop-blur-sm p-5 animate-fade-up" style={{ '--delay': '220ms' }}>
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <span className="text-cyan-400">🏷</span> {t('gameDetail.sidebar.tags')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {gameTags.map((tag) => (
                    <Link
                      key={tag}
                      to={`/?tags=${encodeURIComponent(tag)}`}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-cyan-500/10 text-cyan-300/80 border border-cyan-500/15 hover:bg-cyan-500/20 transition-all"
                    >
                      #{tag}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

/* ---- Sub-components ---- */

function StarRow({ value }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5 text-base leading-none">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= rounded ? 'text-amber-400' : 'text-zinc-700'}>★</span>
      ))}
    </div>
  );
}

function RatingBar({ stars, count, total }) {
  const percent = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500 w-4 text-right">{stars}</span>
      <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-zinc-600 w-6 text-right">{count}</span>
    </div>
  );
}

function CommentCard({ comment, isMine = false, index = 0, currentUserId, onLike, onEdit, onDelete, onReply, likeLoadingId, editTargetId, editDrafts, onEditChange, onSubmitEdit, onCancelEdit, editSubmitLoadingId, replyTargetId, replyDrafts, onReplyChange, onSubmitReply, onCancelReply, replySubmitLoadingId, t }) {
  const username = comment?.user?.username || t('gameDetail.anonymous');
  const avatar = comment?.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`;
  const hasVipFrame = Boolean(comment?.user?.isVip);
  const time = formatRelativeTime(comment?.updatedAt || comment?.createdAt, t);
  const content = comment?.content || '';
  const likeCount = Number(comment?.likes) || 0;
  const likedBy = Array.isArray(comment?.likedBy) ? comment.likedBy : [];
  const isLiked = likedBy.includes(String(currentUserId));
  const isEdited = Boolean(comment?.isEdited);
  const isReply = Boolean(comment?.parentComment);
  const replies = Array.isArray(comment?.replies) ? comment.replies : [];
  const isEditOpen = editTargetId === comment.id;
  const isReplyOpen = replyTargetId === comment.id;

  return (
    <div
      className={`rounded-xl p-4 animate-card-enter transition-all ${
        isMine && !isReply
          ? 'border border-cyan-500/20 bg-cyan-500/5'
          : isReply
          ? 'border border-zinc-800 bg-zinc-900/70'
          : 'border border-white/6 bg-zinc-950/40'
      }`}
      style={{ '--delay': `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-full border-2 bg-zinc-800 overflow-hidden vip-avatar-frame ${hasVipFrame ? 'is-vip vip-avatar-frame--sm border-amber-300/40' : isMine ? 'border-cyan-500/40' : 'border-white/10'}`}>
            <img src={avatar} alt={username} className="w-full h-full object-cover" />
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
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm truncate">{username}</span>
              {hasVipFrame && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-400/35 uppercase">VIP</span>
              )}
              {isMine && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 uppercase">{t('gameDetail.comments.you')}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-600">{time}</span>
              {isEdited && <span className="text-[9px] text-zinc-500">({t('gameDetail.comments.edited')})</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onLike(comment.id)}
            disabled={likeLoadingId === comment.id}
            className={`flex items-center gap-1 text-[11px] font-semibold transition-colors ${isLiked ? 'text-pink-400 hover:text-pink-300' : 'text-zinc-500 hover:text-pink-400'}`}
          >
            <span>{isLiked ? '❤️' : '🤍'}</span>
            <span>{likeCount > 0 ? likeCount : ''}</span>
          </button>
          {!isReply && (
            <button
              type="button"
              onClick={() => onReply(comment.id)}
              className="text-[11px] text-zinc-500 hover:text-cyan-300 font-semibold transition-colors"
            >
              {t('gameDetail.comments.reply')}
            </button>
          )}
          {isMine && (
            <>
              <button
                type="button"
                onClick={() => onEdit(comment)}
                className="text-[11px] text-zinc-500 hover:text-cyan-300 font-semibold transition-colors"
              >
                {t('gameDetail.comments.edit')}
              </button>
              <button
                type="button"
                onClick={() => onDelete(comment.id)}
                className="text-[11px] text-zinc-500 hover:text-red-400 font-semibold transition-colors"
              >
                {t('gameDetail.comments.delete')}
              </button>
            </>
          )}
        </div>
      </div>

      {isEditOpen ? (
        <div className="pl-[42px] space-y-2">
          <textarea
            value={editDrafts[comment.id] || ''}
            onChange={(e) => onEditChange(comment.id, e.target.value)}
            disabled={editSubmitLoadingId === comment.id}
            className="w-full h-20 rounded-lg border border-zinc-700/60 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none disabled:opacity-60"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSubmitEdit(comment.id)}
              disabled={editSubmitLoadingId === comment.id}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
            >
              {editSubmitLoadingId === comment.id ? t('gameDetail.comments.saving') : t('gameDetail.comments.save')}
            </button>
            <button
              type="button"
              onClick={() => onCancelEdit()}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors"
            >
              {t('gameDetail.comments.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-300 leading-relaxed pl-[42px]">{content}</p>
      )}

      {isReplyOpen && !isReply && (
        <div className="mt-3 pl-[42px] space-y-2">
          <textarea
            value={replyDrafts[comment.id] || ''}
            onChange={(e) => onReplyChange(comment.id, e.target.value)}
            disabled={replySubmitLoadingId === comment.id}
            placeholder={t('gameDetail.comments.replyPlaceholder')}
            className="w-full h-20 rounded-lg border border-zinc-700/60 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none disabled:opacity-60"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSubmitReply(comment.id)}
              disabled={replySubmitLoadingId === comment.id}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
            >
              {replySubmitLoadingId === comment.id ? t('gameDetail.comments.replying') : t('gameDetail.comments.replySubmit')}
            </button>
            <button
              type="button"
              onClick={() => onCancelReply()}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors"
            >
              {t('gameDetail.comments.cancelReply')}
            </button>
          </div>
        </div>
      )}

      {replies.length > 0 && !isReply && (
        <div className="mt-3 pl-[42px] space-y-2">
          {replies.map((reply, idx) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              isMine={Boolean(currentUserId && reply?.user?.id && String(reply.user.id) === String(currentUserId))}
              index={idx}
              currentUserId={currentUserId}
              onLike={onLike}
              onEdit={onEdit}
              onDelete={onDelete}
              onReply={onReply}
              likeLoadingId={likeLoadingId}
              editTargetId={editTargetId}
              editDrafts={editDrafts}
              onEditChange={onEditChange}
              onSubmitEdit={onSubmitEdit}
              onCancelEdit={onCancelEdit}
              editSubmitLoadingId={editSubmitLoadingId}
              replyTargetId={replyTargetId}
              replyDrafts={replyDrafts}
              onReplyChange={onReplyChange}
              onSubmitReply={onSubmitReply}
              onCancelReply={onCancelReply}
              replySubmitLoadingId={replySubmitLoadingId}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review, isMine = false, index = 0, t }) {
  const username = review?.user?.username || t('gameDetail.anonymous');
  const avatar = review?.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`;
  const hasVipFrame = Boolean(review?.user?.isVip);
  const rating = Math.max(1, Math.min(5, Number(review?.rating) || 1));
  const time = formatRelativeTime(review?.updatedAt || review?.createdAt, t);
  const content = review?.comment || '';

  return (
    <div
      className={`rounded-xl p-4 animate-card-enter transition-all ${
        isMine
          ? 'border border-cyan-500/20 bg-cyan-500/5'
          : 'border border-white/6 bg-zinc-950/40'
      }`}
      style={{ '--delay': `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-full border-2 bg-zinc-800 overflow-hidden vip-avatar-frame ${hasVipFrame ? 'is-vip vip-avatar-frame--sm border-amber-300/40' : isMine ? 'border-cyan-500/40' : 'border-white/10'}`}>
            <img src={avatar} alt={username} className="w-full h-full object-cover" />
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
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm truncate">{username}</span>
              {hasVipFrame && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-400/35 uppercase">VIP</span>
              )}
              {isMine && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 uppercase">{t('gameDetail.comments.you')}</span>
              )}
            </div>
            <span className="text-[10px] text-zinc-600">{time}</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {[1, 2, 3, 4, 5].map((s) => (
            <span key={s} className={`text-xs ${s <= rating ? 'text-amber-400' : 'text-zinc-700'}`}>★</span>
          ))}
        </div>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed pl-[42px]">{content}</p>
    </div>
  );
}
