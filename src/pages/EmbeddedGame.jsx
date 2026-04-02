import { Link, useParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useCustomGames } from '../context/CustomGamesContext';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';

const TRUSTED_EMBED_HOSTS = [
  'itch.io',
  'newgrounds.com',
  'gamedistribution.com',
  'crazygames.com',
  'poki.com',
  'localhost',
  '127.0.0.1'
];

const TELEMETRY_STORAGE_KEY = 'gamehub.embed.telemetry';
const IFRAME_TIMEOUT_MS = 20000;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const COMMENTS_PAGE_SIZE = 6;
const COMMENT_SORT_OPTIONS = ['newest', 'oldest'];
const SCORE_EVENT_TYPES = new Set([
  'game_score',
  'score',
  'score_update',
  'submit_score',
  'match_end',
  'game_result'
]);

const isValidHttpUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const normalizePagination = (rawPagination, fallbackLimit = COMMENTS_PAGE_SIZE) => ({
  page: Number(rawPagination?.page) || 1,
  limit: Number(rawPagination?.limit) || fallbackLimit,
  total: Number(rawPagination?.total) || 0,
  totalPages: Number(rawPagination?.totalPages) || 1,
  hasNextPage: Boolean(rawPagination?.hasNextPage),
  hasPrevPage: Boolean(rawPagination?.hasPrevPage)
});

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

const getUrlHost = (value) => {
  if (!isValidHttpUrl(value)) return '';
  return new URL(value.trim()).hostname.toLowerCase();
};

const getUrlOrigin = (value) => {
  if (!isValidHttpUrl(value)) return '';
  return new URL(value.trim()).origin;
};

const isTrustedEmbedUrl = (value) => {
  const host = getUrlHost(value);
  if (!host) return false;
  return TRUSTED_EMBED_HOSTS.some((trustedHost) => (
    host === trustedHost || host.endsWith(`.${trustedHost}`)
  ));
};

const normalizeScoreMessage = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : raw;
  const eventTypeRaw = raw.type || raw.event || raw.eventName || payload.type || payload.event || payload.eventName;
  const eventType = typeof eventTypeRaw === 'string' ? eventTypeRaw.trim().toLowerCase() : '';
  if (!SCORE_EVENT_TYPES.has(eventType)) return null;

  const scoreRaw = payload.score ?? payload.points ?? payload.value;
  const score = Number(scoreRaw);
  if (!Number.isFinite(score)) return null;

  const result = typeof payload.result === 'string' && payload.result.trim()
    ? payload.result.trim().toLowerCase()
    : 'completed';
  const activityType = typeof payload.activityType === 'string' && payload.activityType.trim()
    ? payload.activityType.trim().toLowerCase()
    : 'match_end';
  const durationCandidate = Number(payload.durationSeconds ?? payload.duration ?? payload.timeSeconds ?? 0);
  const durationSeconds = Number.isFinite(durationCandidate) && durationCandidate > 0
    ? Math.round(durationCandidate)
    : 0;
  const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};

  return {
    eventType,
    score,
    result,
    activityType,
    durationSeconds,
    metadata
  };
};

export default function EmbeddedGame() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { user, addGameHistory } = useAuth();
  const authUserId = user?._id || user?.id || null;
  const currentUserId = authUserId;
  const telemetryStorageKey = authUserId
    ? `${TELEMETRY_STORAGE_KEY}.${authUserId}`
    : TELEMETRY_STORAGE_KEY;
  const { customGames, loading: gamesLoading } = useCustomGames();
  const game = customGames.find((g) => (g._id || g.id) === id);
  const gameId = game?._id || game?.id || id;
  const gameUrl = typeof (game?.embedUrl || game?.url) === 'string'
    ? (game.embedUrl || game.url).trim()
    : '';
  const externalGameUrl = typeof (game?.url || game?.embedUrl) === 'string'
    ? (game.url || game.embedUrl).trim()
    : '';
  const vipLocked = Boolean(game?.vipLocked || (game?.vipOnly && !user?.isVip));
  const isTrustedUrl = useMemo(() => isTrustedEmbedUrl(gameUrl), [gameUrl]);
  const gameHost = useMemo(() => getUrlHost(gameUrl), [gameUrl]);

  const frameWrapperRef = useRef(null);
  const iframeRef = useRef(null);
  const lazyMountSentinelRef = useRef(null);
  const iframeTimeoutRef = useRef(null);
  const iframeLoadStartRef = useRef(0);
  const sessionStartRef = useRef(0);
  const gameMetaRef = useRef({ gameId, title: game?.title || 'Unknown Game' });
  const wasFullscreenRef = useRef(false);
  const iframeLoadedRef = useRef(false);
  const lastScoreSignatureRef = useRef({ signature: '', at: 0 });
  const hasPersistedMatchRef = useRef(false);
  const sessionFallbackSavedRef = useRef(false);

  const [allowUntrustedUrl, setAllowUntrustedUrl] = useState(false);
  const [shouldMountIframe, setShouldMountIframe] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [isIframeLoading, setIsIframeLoading] = useState(false);
  const [isIframeLoaded, setIsIframeLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState('');
  const [recommendationSource, setRecommendationSource] = useState('');
  const [comments, setComments] = useState([]);
  const [commentsPagination, setCommentsPagination] = useState(normalizePagination());
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsSort, setCommentsSort] = useState('newest');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState('');
  const [commentSuccess, setCommentSuccess] = useState('');
  const [submitCommentLoading, setSubmitCommentLoading] = useState(false);
  const [draftComment, setDraftComment] = useState('');
  const [activeReplyTargetId, setActiveReplyTargetId] = useState('');
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replySubmitLoadingId, setReplySubmitLoadingId] = useState('');
  const [editTargetId, setEditTargetId] = useState('');
  const [editDrafts, setEditDrafts] = useState({});
  const [editSubmitLoadingId, setEditSubmitLoadingId] = useState('');
  const [likeLoadingId, setLikeLoadingId] = useState('');

  const canUseIframe = Boolean(gameUrl) && (isTrustedUrl || allowUntrustedUrl);

  const getAuthConfig = useCallback((config = {}) => {
    const token = localStorage.getItem('token');
    if (!token) return config;
    return {
      ...config,
      headers: {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`
      }
    };
  }, []);

  useEffect(() => {
    gameMetaRef.current = {
      gameId,
      title: game?.title || 'Unknown Game'
    };
  }, [gameId, game?.title]);

  const recordTelemetry = useCallback((eventName, details = {}) => {
    const payload = {
      eventName,
      userId: authUserId,
      gameId: gameMetaRef.current.gameId,
      title: gameMetaRef.current.title,
      timestamp: new Date().toISOString(),
      ...details
    };
    console.info('[EmbedTelemetry]', payload);

    try {
      const current = JSON.parse(localStorage.getItem(telemetryStorageKey) || '[]');
      const next = [payload, ...current].slice(0, 100);
      localStorage.setItem(telemetryStorageKey, JSON.stringify(next));
    } catch {
      // noop
    }
  }, [authUserId, telemetryStorageKey]);

  const clearIframeTimeout = useCallback(() => {
    if (iframeTimeoutRef.current) {
      clearTimeout(iframeTimeoutRef.current);
      iframeTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    sessionStartRef.current = Date.now();
    iframeLoadedRef.current = false;
    hasPersistedMatchRef.current = false;
    sessionFallbackSavedRef.current = false;
    setAllowUntrustedUrl(false);
    setShouldMountIframe(false);
    setIframeKey(0);
    setIsIframeLoading(false);
    setIsIframeLoaded(false);
    setLoadError('');
    clearIframeTimeout();
  }, [id, clearIframeTimeout]);

  useEffect(() => {
    setRecommendations([]);
    setRecommendationsError('');
    setRecommendationSource('');
  }, [id]);

  useEffect(() => {
    if (!canUseIframe) return undefined;

    const handleMessage = (event) => {
      const sourceWindow = iframeRef.current?.contentWindow;
      if (!sourceWindow || event.source !== sourceWindow) return;

      const originHost = getUrlHost(event.origin);
      if (!originHost) return;

      const matchesGameHost = Boolean(gameHost) && (
        originHost === gameHost ||
        originHost.endsWith(`.${gameHost}`) ||
        gameHost.endsWith(`.${originHost}`)
      );
      const trustedHost = TRUSTED_EMBED_HOSTS.some((trusted) => (
        originHost === trusted || originHost.endsWith(`.${trusted}`)
      ));
      if (!matchesGameHost && !trustedHost) return;

      const parsed = normalizeScoreMessage(event.data);
      if (!parsed) return;

      const signature = [
        gameId,
        parsed.eventType,
        parsed.score,
        parsed.result,
        parsed.activityType,
        parsed.durationSeconds
      ].join('|');
      const now = Date.now();
      const isDuplicate = (
        lastScoreSignatureRef.current.signature === signature &&
        now - lastScoreSignatureRef.current.at < 4000
      );
      if (isDuplicate) return;
      lastScoreSignatureRef.current = { signature, at: now };

      if (!user) {
        recordTelemetry('score_message_ignored_no_user', {
          eventType: parsed.eventType,
          score: parsed.score,
          origin: event.origin
        });
        return;
      }

      addGameHistory(gameId, parsed.score, {
        activityType: parsed.activityType,
        result: parsed.result,
        durationSeconds: parsed.durationSeconds,
        metadata: {
          source: 'postmessage',
          eventType: parsed.eventType,
          origin: event.origin,
          ...parsed.metadata
        }
      })
        .then(() => {
          hasPersistedMatchRef.current = true;
          recordTelemetry('score_message_saved', {
            eventType: parsed.eventType,
            score: parsed.score,
            result: parsed.result,
            durationSeconds: parsed.durationSeconds
          });
        })
        .catch((error) => {
          recordTelemetry('score_message_save_failed', {
            eventType: parsed.eventType,
            score: parsed.score,
            message: error?.message || 'unknown_error'
          });
        });
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [addGameHistory, canUseIframe, gameHost, gameId, recordTelemetry, user]);

  useEffect(() => () => {
    clearIframeTimeout();
  }, [clearIframeTimeout]);

  useEffect(() => {
    if (!canUseIframe) return undefined;
    const origin = getUrlOrigin(gameUrl);
    if (!origin) return undefined;

    const existing = document.querySelector(`link[data-embed-preconnect="${origin}"]`);
    if (existing) return undefined;

    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    link.crossOrigin = 'anonymous';
    link.setAttribute('data-embed-preconnect', origin);
    document.head.appendChild(link);

    return () => {
      if (document.head.contains(link)) {
        document.head.removeChild(link);
      }
    };
  }, [canUseIframe, gameUrl]);

  useEffect(() => {
    if (!canUseIframe || shouldMountIframe) return undefined;

    const target = lazyMountSentinelRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      setShouldMountIframe(true);
      recordTelemetry('iframe_lazy_mounted', { trigger: 'fallback' });
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const shouldActivate = entries.some((entry) => entry.isIntersecting);
        if (shouldActivate) {
          setShouldMountIframe(true);
          recordTelemetry('iframe_lazy_mounted', { trigger: 'intersection' });
          observer.disconnect();
        }
      },
      { rootMargin: '240px 0px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [canUseIframe, shouldMountIframe, recordTelemetry]);

  useEffect(() => {
    if (!canUseIframe || !shouldMountIframe) return undefined;

    setIsIframeLoading(true);
    setIsIframeLoaded(false);
    setLoadError('');
    iframeLoadStartRef.current = Date.now();
    clearIframeTimeout();
    iframeTimeoutRef.current = window.setTimeout(() => {
      setIsIframeLoading(false);
      setLoadError(t('embeddedGame.timeoutError'));
      recordTelemetry('iframe_timeout', { timeoutMs: IFRAME_TIMEOUT_MS });
    }, IFRAME_TIMEOUT_MS);
    recordTelemetry('iframe_load_started', { iframeKey });

    return clearIframeTimeout;
  }, [canUseIframe, shouldMountIframe, iframeKey, clearIframeTimeout, recordTelemetry]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(active);
      if (active && !wasFullscreenRef.current) {
        recordTelemetry('fullscreen_entered');
      } else if (!active && wasFullscreenRef.current) {
        recordTelemetry('fullscreen_exited');
      }
      wasFullscreenRef.current = active;
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, [recordTelemetry]);

  useEffect(() => {
    const onVisibilityChange = () => {
      recordTelemetry(document.hidden ? 'tab_hidden' : 'tab_visible');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [recordTelemetry]);

  useEffect(() => () => {
    const durationMs = Date.now() - sessionStartRef.current;
    recordTelemetry('session_end', {
      durationMs,
      iframeLoaded: iframeLoadedRef.current
    });

    if (!user || hasPersistedMatchRef.current || sessionFallbackSavedRef.current) return;
    sessionFallbackSavedRef.current = true;

    const durationSeconds = Math.max(0, Math.round(durationMs / 1000));
    addGameHistory(gameMetaRef.current.gameId, 0, {
      activityType: 'session_end',
      result: 'completed',
      durationSeconds,
      metadata: {
        source: 'session_exit_auto',
        iframeLoaded: iframeLoadedRef.current
      }
    })
      .then(() => {
        hasPersistedMatchRef.current = true;
        recordTelemetry('session_end_saved', { durationSeconds });
      })
      .catch((error) => {
        recordTelemetry('session_end_save_failed', {
          durationSeconds,
          message: error?.message || 'unknown_error'
        });
      });
  }, [addGameHistory, recordTelemetry, user]);

  const handleOpenInNewTab = () => {
    if (!externalGameUrl) return;
    window.open(externalGameUrl, '_blank', 'noopener,noreferrer');
    recordTelemetry('open_new_tab_clicked');
  };

  const handleRetry = () => {
    setLoadError('');
    setShouldMountIframe(true);
    setIframeKey((current) => current + 1);
    recordTelemetry('iframe_retry_clicked');
  };

  const loadRecommendations = useCallback(async () => {
    if (!gameId) return;
    setRecommendationsLoading(true);
    setRecommendationsError('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_BASE_URL}/ai/recommendations`,
        { gameId, limit: 6 },
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
      );
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      setRecommendations(items);
      setRecommendationSource(typeof res.data?.source === 'string' ? res.data.source : '');
      if (items.length === 0) {
        setRecommendationsError(t('embeddedGame.noRecommendations'));
      }
    } catch (error) {
      setRecommendations([]);
      setRecommendationsError(error?.response?.data?.message || t('embeddedGame.recommendationsError'));
    } finally {
      setRecommendationsLoading(false);
    }
  }, [gameId]);

  const loadComments = useCallback(async ({ page = 1, sort = commentsSort } = {}) => {
    if (!gameId) return;
    try {
      setCommentsLoading(true);
      setCommentsError('');
      const res = await axios.get(`${API_BASE_URL}/games/${gameId}/comments`, {
        params: { page, limit: COMMENTS_PAGE_SIZE, sort }
      });
      setComments(Array.isArray(res.data?.comments) ? res.data.comments : []);
      setCommentsPagination(normalizePagination(res.data?.pagination));
      setCommentsTotal(Number(res.data?.totalComments) || Number(res.data?.pagination?.total) || 0);
    } catch (error) {
      setCommentsError(error?.response?.data?.message || t('embeddedGame.comments.loadError'));
    } finally {
      setCommentsLoading(false);
    }
  }, [commentsSort, gameId, t]);

  const submitComment = useCallback(async ({ content, parentCommentId = '' } = {}) => {
    const trimmed = typeof content === 'string' ? content.trim() : '';
    if (!trimmed) {
      setCommentsError(t('embeddedGame.comments.commentRequired'));
      return { success: false };
    }

    try {
      await axios.post(
        `${API_BASE_URL}/games/${gameId}/comments`,
        {
          content: trimmed,
          ...(parentCommentId ? { parentComment: parentCommentId } : {})
        },
        getAuthConfig()
      );
      return { success: true };
    } catch (error) {
      setCommentsError(error?.response?.data?.message || t('embeddedGame.comments.submitError'));
      return { success: false };
    }
  }, [gameId, getAuthConfig, t]);

  const handleSubmitComment = async () => {
    setCommentsError('');
    setCommentSuccess('');
    if (!user) {
      setCommentsError(t('embeddedGame.comments.loginRequired'));
      return;
    }

    try {
      setSubmitCommentLoading(true);
      const result = await submitComment({ content: draftComment });
      if (!result.success) return;
      setDraftComment('');
      setCommentSuccess(t('embeddedGame.comments.submitSuccess'));
      await loadComments({ page: 1, sort: commentsSort });
    } finally {
      setSubmitCommentLoading(false);
    }
  };

  const handleReplyInputChange = (commentId, value) => {
    setReplyDrafts((prev) => ({ ...prev, [commentId]: value }));
  };

  const handleEditInputChange = (commentId, value) => {
    setEditDrafts((prev) => ({ ...prev, [commentId]: value }));
  };

  const handleToggleEdit = (comment) => {
    setCommentsError('');
    setCommentSuccess('');
    const commentId = comment.id;
    if (editTargetId === commentId) {
      setEditTargetId('');
      return;
    }
    setEditTargetId(commentId);
    setEditDrafts((prev) => ({ ...prev, [commentId]: comment.content || '' }));
  };

  const handleSubmitEdit = async (commentId) => {
    setCommentsError('');
    setCommentSuccess('');
    if (!user) {
      setCommentsError(t('embeddedGame.comments.loginRequired'));
      return;
    }
    const content = editDrafts[commentId] || '';
    const trimmed = content.trim();
    if (!trimmed) {
      setCommentsError(t('embeddedGame.comments.commentRequired'));
      return;
    }
    try {
      setEditSubmitLoadingId(commentId);
      await axios.put(
        `${API_BASE_URL}/games/${gameId}/comments/${commentId}`,
        { content: trimmed },
        getAuthConfig()
      );
      setEditTargetId('');
      setCommentSuccess(t('embeddedGame.comments.editSuccess'));
      await loadComments({ page: commentsPagination.page, sort: commentsSort });
    } catch (error) {
      setCommentsError(error?.response?.data?.message || t('embeddedGame.comments.editError'));
    } finally {
      setEditSubmitLoadingId('');
    }
  };

  const handleDeleteComment = async (commentId) => {
    setCommentsError('');
    setCommentSuccess('');
    if (!user) {
      setCommentsError(t('embeddedGame.comments.loginRequired'));
      return;
    }
    const confirmed = window.confirm(t('embeddedGame.comments.deleteConfirm'));
    if (!confirmed) return;
    try {
      await axios.delete(
        `${API_BASE_URL}/games/${gameId}/comments/${commentId}`,
        getAuthConfig()
      );
      setCommentSuccess(t('embeddedGame.comments.deleteSuccess'));
      await loadComments({ page: commentsPagination.page, sort: commentsSort });
    } catch (error) {
      setCommentsError(error?.response?.data?.message || t('embeddedGame.comments.deleteError'));
    }
  };

  const handleLikeComment = async (commentId) => {
    if (!user) {
      setCommentsError(t('embeddedGame.comments.loginRequired'));
      return;
    }
    try {
      setLikeLoadingId(commentId);
      await axios.post(
        `${API_BASE_URL}/games/${gameId}/comments/${commentId}/like`,
        {},
        getAuthConfig()
      );
      await loadComments({ page: commentsPagination.page, sort: commentsSort });
    } catch (error) {
      setCommentsError(error?.response?.data?.message || t('embeddedGame.comments.likeError'));
    } finally {
      setLikeLoadingId('');
    }
  };

  const handleToggleReply = (commentId) => {
    setCommentsError('');
    setCommentSuccess('');
    setActiveReplyTargetId((current) => (current === commentId ? '' : commentId));
  };

  const handleSubmitReply = async (commentId) => {
    setCommentsError('');
    setCommentSuccess('');
    if (!user) {
      setCommentsError(t('embeddedGame.comments.loginRequired'));
      return;
    }

    const replyText = replyDrafts[commentId] || '';
    try {
      setReplySubmitLoadingId(commentId);
      const result = await submitComment({ content: replyText, parentCommentId: commentId });
      if (!result.success) return;
      setReplyDrafts((prev) => ({ ...prev, [commentId]: '' }));
      setActiveReplyTargetId('');
      setCommentSuccess(t('embeddedGame.comments.replySuccess'));
      await loadComments({ page: commentsPagination.page, sort: commentsSort });
    } finally {
      setReplySubmitLoadingId('');
    }
  };

  useEffect(() => {
    if (!commentSuccess) return undefined;
    const timeout = setTimeout(() => setCommentSuccess(''), 3500);
    return () => clearTimeout(timeout);
  }, [commentSuccess]);

  useEffect(() => {
    if (!isIframeLoaded) return;
    loadComments({ page: 1, sort: commentsSort });
  }, [commentsSort, isIframeLoaded, loadComments]);

  const handleIframeLoaded = () => {
    clearIframeTimeout();
    setIsIframeLoading(false);
    setIsIframeLoaded(true);
    setLoadError('');
    iframeLoadedRef.current = true;
    const loadMs = iframeLoadStartRef.current ? Date.now() - iframeLoadStartRef.current : undefined;
    recordTelemetry('iframe_load_success', { loadMs });
    loadRecommendations();
    loadComments({ page: 1, sort: commentsSort });
  };

  const handleIframeError = () => {
    clearIframeTimeout();
    setIsIframeLoading(false);
    setIsIframeLoaded(false);
    setLoadError(t('embeddedGame.loadError'));
    recordTelemetry('iframe_load_error');
  };

  const handleManualStart = () => {
    setShouldMountIframe(true);
    recordTelemetry('iframe_lazy_mounted', { trigger: 'manual_click' });
  };

  const toggleFullscreen = async () => {
    const target = frameWrapperRef.current;
    if (!target) return;
    try {
      const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
      if (fullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
        return;
      }

      if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen();
      }
    } catch (error) {
      setLoadError('Your browser blocked fullscreen for this game.');
      recordTelemetry('fullscreen_failed', { message: error?.message || 'unknown_error' });
    }
  };

  if (gamesLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center">
        <Navbar />
        <p className="text-zinc-400">{t('embeddedGame.loading')}</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center">
        <Navbar />
        <h2 className="text-2xl font-bold mb-4">Game Not Found</h2>
        <Link to="/" className="px-6 py-2 bg-orange-500 hover:bg-orange-600 transition-colors rounded-lg">Go Home</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col animate-page-in">
      <Navbar />
      
      <div className="fixed inset-0 z-0 bg-grid-pattern opacity-10 pointer-events-none animate-fade-in"></div>

      <div className="container mx-auto px-6 pt-32 pb-12 relative z-10 flex flex-col items-center flex-1">
        <h1 className="text-4xl font-black italic tracking-tighter mb-4 animate-fade-up" style={{ '--delay': '80ms' }}>{game.title}</h1>
        <p className="text-zinc-400 mb-3 max-w-3xl text-center animate-fade-up" style={{ '--delay': '140ms' }}>{game.description || 'No description available.'}</p>
        {gameHost && (
          <p className="text-xs text-zinc-500 mb-8 animate-fade-up" style={{ '--delay': '180ms' }}>
            Embed host: <span className={isTrustedUrl ? 'text-emerald-300' : 'text-amber-300'}>{gameHost}</span>
          </p>
        )}

        {vipLocked ? (
          <div className="w-full max-w-4xl p-8 bg-zinc-900 rounded-xl border border-amber-500/30 text-center animate-fade-up" style={{ '--delay': '210ms' }}>
            <h3 className="text-xl font-black text-amber-200 mb-2">{t('embeddedGame.vipOnlyTitle')}</h3>
            <p className="text-zinc-300 mb-6">{t('embeddedGame.vipOnlyDesc')}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/membership" className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 font-bold hover:opacity-90 transition-opacity">
                {t('embeddedGame.upgradeVip')}
              </Link>
              <Link to={`/games/${gameId}`} className="px-5 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors font-bold text-white">
                {t('embeddedGame.backToDetails')}
              </Link>
            </div>
          </div>
        ) : !gameUrl ? (
          <div className="w-full max-w-4xl p-8 bg-zinc-900 rounded-xl border border-zinc-800 text-center animate-fade-up" style={{ '--delay': '210ms' }}>
            <p className="text-red-400 font-medium">This game does not have a valid embed URL.</p>
          </div>
        ) : !isTrustedUrl && !allowUntrustedUrl ? (
          <div className="w-full max-w-4xl p-8 bg-zinc-900 rounded-xl border border-amber-500/40 text-center animate-fade-up" style={{ '--delay': '210ms' }}>
            <h3 className="text-lg font-bold text-amber-200 mb-2">Untrusted embed domain</h3>
            <p className="text-zinc-300 mb-6">
              Domain <span className="font-mono">{gameHost || 'unknown'}</span> is not in the trusted list.
              Open in new tab, or explicitly allow iframe load for this session.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setAllowUntrustedUrl(true);
                  recordTelemetry('untrusted_embed_allowed', { host: gameHost });
                }}
                className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 transition-colors font-bold text-white button-lift"
              >
                Trust and Load Anyway
              </button>
              <button
                type="button"
                onClick={handleOpenInNewTab}
                className="px-5 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors font-bold text-white button-lift"
              >
                Open in New Tab ↗
              </button>
            </div>
          </div>
        ) : (
          <div
            ref={frameWrapperRef}
            className={`w-full animate-fade-up ${isFullscreen ? 'h-full' : 'max-w-6xl'}`}
            style={{ '--delay': '210ms' }}
          >
            <div
              ref={lazyMountSentinelRef}
              className={`relative w-full bg-zinc-900 overflow-hidden ${
                isFullscreen
                  ? 'h-full'
                  : 'h-[62vh] sm:h-[70vh] max-h-[820px] rounded-xl border border-zinc-800 shadow-2xl'
              }`}
            >
              {!shouldMountIframe && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-zinc-950/80 to-zinc-900/90 text-center px-6">
                  <p className="text-zinc-200 font-medium">Ready to start this game?</p>
                  <button
                    type="button"
                    onClick={handleManualStart}
                    className="px-6 py-3 rounded-lg bg-orange-500 hover:bg-orange-600 transition-colors font-bold text-white button-lift"
                  >
                    Start Game
                  </button>
                  <p className="text-xs text-zinc-500">Iframe mounts lazily to improve performance.</p>
                </div>
              )}

              {shouldMountIframe && (
                <iframe
                  ref={iframeRef}
                  key={`${gameId}-${iframeKey}`}
                  src={gameUrl}
                  title={game.title}
                  className="w-full h-full border-0"
                  allowFullScreen
                  allow="autoplay; fullscreen; gamepad; pointer-lock; clipboard-read; clipboard-write"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-top-navigation-by-user-activation"
                  referrerPolicy="strict-origin-when-cross-origin"
                  loading="eager"
                  onLoad={handleIframeLoaded}
                  onError={handleIframeError}
                />
              )}

              {isIframeLoading && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-zinc-950/75 backdrop-blur-sm">
                  <div className="w-10 h-10 rounded-full border-2 border-zinc-500 border-t-orange-400 animate-spin" />
                  <p className="text-sm text-zinc-200">{t('embeddedGame.loadingIframe')}</p>
                  <p className="text-xs text-zinc-500">{t('embeddedGame.timeoutNote', { seconds: IFRAME_TIMEOUT_MS / 1000 })}</p>
                </div>
              )}

              {loadError && !isIframeLoading && (
                <div className="absolute left-4 right-4 bottom-4 z-40 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {loadError}
                </div>
              )}
            </div>
          </div>
        )}

        {gameUrl && !vipLocked && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 animate-fade-up" style={{ '--delay': '260ms' }}>
            {canUseIframe && (
              <button
                type="button"
                onClick={handleRetry}
                className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-bold transition-colors button-lift"
              >
                {t('embeddedGame.retryLoad')}
              </button>
            )}
            {canUseIframe && (
              <button
                type="button"
                onClick={toggleFullscreen}
                className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-bold transition-colors button-lift"
              >
                {isFullscreen ? t('embeddedGame.exitFullscreen') : t('embeddedGame.fullscreen')}
              </button>
            )}
            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-bold transition-colors flex items-center gap-2 button-lift"
            >
              {t('embeddedGame.openNewTab')} <span className="text-xs">↗</span>
            </button>
            {isIframeLoaded && (
              <span className="text-xs text-emerald-300">Live</span>
            )}
          </div>
        )}

        <div className="w-full max-w-6xl mt-8 animate-fade-up" style={{ '--delay': '300ms' }}>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-bold">{t('embeddedGame.aiRecommendations')}</h3>
              <button
                type="button"
                onClick={loadRecommendations}
                disabled={recommendationsLoading}
                className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
              >
                {recommendationsLoading ? t('embeddedGame.gettingRecommendations') : t('embeddedGame.refreshRecommendations')}
              </button>
            </div>

            {recommendationSource && (
              <p className="text-[11px] text-zinc-500 mb-3">
                {t('embeddedGame.recommendationSource')} <span className="text-zinc-300 font-semibold uppercase">{recommendationSource}</span>
              </p>
            )}

            {recommendationsError && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 mb-3">
                {recommendationsError}
              </div>
            )}

            {recommendations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {recommendations.map((item) => (
                  <Link
                    key={item.id}
                    to={`/games/play/${item.id}`}
                    className="rounded-xl border border-zinc-700 bg-zinc-900/70 hover:border-cyan-500/50 transition-colors overflow-hidden"
                  >
                    <div className="aspect-video bg-zinc-800">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600 text-3xl">🎮</div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-bold text-sm text-white truncate">{item.title}</p>
                      <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{item.reason || t('embeddedGame.recommendationReason')}</p>
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-500">
                        {item.category && <span>{item.category}</span>}
                        {item.difficulty && <span>• {item.difficulty}</span>}
                        {Number(item.rating) > 0 && <span>• ★ {Number(item.rating).toFixed(1)}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : !recommendationsLoading && !recommendationsError ? (
              <p className="text-sm text-zinc-500">{t('embeddedGame.recommendationsHint')}</p>
            ) : null}
          </div>
        </div>

        <div className="w-full max-w-6xl mt-8 animate-fade-up" style={{ '--delay': '340ms' }}>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-bold">{t('embeddedGame.comments.title')}</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">{t('embeddedGame.comments.count', { count: commentsTotal })}</span>
                <select
                  value={commentsSort}
                  onChange={(e) => setCommentsSort(e.target.value)}
                  className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-200 focus:outline-none"
                >
                  {COMMENT_SORT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{t(`gameDetail.sort.${opt}`)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start">
                <textarea
                  value={draftComment}
                  onChange={(e) => setDraftComment(e.target.value)}
                  disabled={!user || submitCommentLoading}
                  placeholder={user ? t('embeddedGame.comments.placeholder') : t('embeddedGame.comments.loginPlaceholder')}
                  className="h-24 rounded-lg border border-zinc-700/60 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleSubmitComment}
                  disabled={!user || submitCommentLoading}
                  className="px-4 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-colors disabled:opacity-60"
                >
                  {submitCommentLoading ? t('embeddedGame.comments.submitting') : t('embeddedGame.comments.submit')}
                </button>
              </div>
              {!user && (
                <p className="text-xs text-zinc-500 mt-2">
                  <Link to="/login" className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">{t('embeddedGame.comments.loginCta')}</Link>
                  {' '}{t('embeddedGame.comments.loginHint')}
                </p>
              )}
              {commentSuccess && (
                <p className="text-xs text-emerald-300 mt-2">{commentSuccess}</p>
              )}
              {commentsError && (
                <p className="text-xs text-red-300 mt-2">{commentsError}</p>
              )}
            </div>

            {commentsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-20 rounded-xl bg-zinc-800/50 animate-pulse" />
                ))}
              </div>
            ) : comments.length > 0 ? (
              <div className="space-y-3">
                {comments.map((comment) => {
                  const commentUserId = comment?.user?.id || comment?.user?._id;
                  const isMine = Boolean(currentUserId && commentUserId && String(commentUserId) === String(currentUserId));
                  const username = comment?.user?.username || t('gameDetail.anonymous');
                  const avatar = comment?.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`;
                  const hasVipFrame = Boolean(comment?.user?.isVip);
                  const replies = Array.isArray(comment?.replies) ? comment.replies : [];
                  const isReplyOpen = activeReplyTargetId === comment.id;
                  const isEditOpen = editTargetId === comment.id;
                  const likeCount = Number(comment?.likes) || 0;
                  const likedBy = Array.isArray(comment?.likedBy) ? comment.likedBy : [];
                  const isLiked = likedBy.includes(String(currentUserId));
                  const isEdited = Boolean(comment?.isEdited);
                  return (
                    <div key={comment.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
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
                            <p className="text-sm font-semibold text-zinc-100 truncate">
                              {username}
                              {hasVipFrame ? <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-400/35 uppercase">VIP</span> : null}
                              {isMine ? <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 uppercase">{t('gameDetail.comments.you')}</span> : null}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-zinc-500">{formatRelativeTime(comment.updatedAt || comment.createdAt, t)}</span>
                              {isEdited && <span className="text-[10px] text-zinc-500">({t('embeddedGame.comments.edited')})</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleLikeComment(comment.id)}
                            disabled={likeLoadingId === comment.id}
                            className={`flex items-center gap-1 text-[11px] font-semibold transition-colors ${isLiked ? 'text-pink-400 hover:text-pink-300' : 'text-zinc-400 hover:text-pink-400'}`}
                          >
                            <span>{isLiked ? '❤️' : '🤍'}</span>
                            <span>{likeCount > 0 ? likeCount : ''}</span>
                          </button>
                          {isMine && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleEdit(comment)}
                                className="text-[11px] text-zinc-400 hover:text-cyan-300 font-semibold transition-colors"
                              >
                                {t('embeddedGame.comments.edit')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(comment.id)}
                                className="text-[11px] text-zinc-400 hover:text-red-400 font-semibold transition-colors"
                              >
                                {t('embeddedGame.comments.delete')}
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleReply(comment.id)}
                            className="text-[11px] text-zinc-400 hover:text-cyan-300 font-semibold transition-colors"
                          >
                            {t('embeddedGame.comments.reply')}
                          </button>
                        </div>
                      </div>

                      {isEditOpen ? (
                        <div className="pl-[42px] space-y-2">
                          <textarea
                            value={editDrafts[comment.id] || ''}
                            onChange={(e) => handleEditInputChange(comment.id, e.target.value)}
                            disabled={editSubmitLoadingId === comment.id}
                            className="w-full h-20 rounded-lg border border-zinc-700/60 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none disabled:opacity-60"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSubmitEdit(comment.id)}
                              disabled={editSubmitLoadingId === comment.id}
                              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
                            >
                              {editSubmitLoadingId === comment.id ? t('embeddedGame.comments.saving') : t('embeddedGame.comments.save')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditTargetId('')}
                              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors"
                            >
                              {t('embeddedGame.comments.cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-300 whitespace-pre-wrap pl-[42px]">{comment.content || ''}</p>
                      )}

                      {replies.length > 0 && (
                        <div className="mt-3 pl-[42px] space-y-2">
                          {replies.map((reply) => {
                            const replyUserId = reply?.user?.id || reply?.user?._id;
                            const isReplyMine = Boolean(currentUserId && replyUserId && String(replyUserId) === String(currentUserId));
                            const replyUsername = reply?.user?.username || t('gameDetail.anonymous');
                            const replyAvatar = reply?.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(replyUsername)}`;
                            const hasReplyVipFrame = Boolean(reply?.user?.isVip);
                            return (
                              <div key={reply.id} className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2.5">
                                <div className="flex items-center gap-2 mb-1.5 min-w-0">
                                  <div className={`w-6 h-6 rounded-full border bg-zinc-800 overflow-hidden vip-avatar-frame ${hasReplyVipFrame ? 'is-vip vip-avatar-frame--sm border-amber-300/40' : isReplyMine ? 'border-cyan-500/40' : 'border-white/10'}`}>
                                    <img src={replyAvatar} alt={replyUsername} className="w-full h-full object-cover" />
                                    {hasReplyVipFrame && <span className="vip-avatar-crown vip-avatar-crown--sm">👑</span>}
                                  </div>
                                  <p className="text-xs font-semibold text-zinc-100 truncate">
                                    {replyUsername}
                                    {isReplyMine ? <span className="ml-1 text-[9px] text-cyan-300">{t('gameDetail.comments.you')}</span> : null}
                                  </p>
                                  <span className="text-[10px] text-zinc-500 ml-auto">{formatRelativeTime(reply.updatedAt || reply.createdAt, t)}</span>
                                </div>
                                <p className="text-sm text-zinc-300 whitespace-pre-wrap pl-8">{reply.content || ''}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {isReplyOpen && (
                        <div className="mt-3 pl-[42px] space-y-2">
                          <textarea
                            value={replyDrafts[comment.id] || ''}
                            onChange={(e) => handleReplyInputChange(comment.id, e.target.value)}
                            disabled={!user || replySubmitLoadingId === comment.id}
                            placeholder={user ? t('embeddedGame.comments.replyPlaceholder') : t('embeddedGame.comments.loginPlaceholder')}
                            className="w-full h-20 rounded-lg border border-zinc-700/60 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none disabled:opacity-60"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSubmitReply(comment.id)}
                              disabled={!user || replySubmitLoadingId === comment.id}
                              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
                            >
                              {replySubmitLoadingId === comment.id ? t('embeddedGame.comments.replying') : t('embeddedGame.comments.replySubmit')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveReplyTargetId('')}
                              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors"
                            >
                              {t('embeddedGame.comments.cancelReply')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">{t('embeddedGame.comments.empty')}</p>
            )}

            {commentsPagination.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => loadComments({ page: commentsPagination.page - 1, sort: commentsSort })}
                  disabled={!commentsPagination.hasPrevPage || commentsLoading}
                  className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-bold disabled:opacity-40"
                >
                  {t('embeddedGame.comments.previous')}
                </button>
                <span className="text-xs text-zinc-500">{commentsPagination.page} / {commentsPagination.totalPages}</span>
                <button
                  type="button"
                  onClick={() => loadComments({ page: commentsPagination.page + 1, sort: commentsSort })}
                  disabled={!commentsPagination.hasNextPage || commentsLoading}
                  className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-bold disabled:opacity-40"
                >
                  {t('embeddedGame.comments.next')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
