import { Link, useParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const IFRAME_TIMEOUT_MS = 10000;
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
  const { id } = useParams();
  const { user, addGameHistory } = useAuth();
  const authUserId = user?._id || user?.id || null;
  const telemetryStorageKey = authUserId
    ? `${TELEMETRY_STORAGE_KEY}.${authUserId}`
    : TELEMETRY_STORAGE_KEY;
  const { customGames, loading: gamesLoading } = useCustomGames();
  const game = customGames.find((g) => (g._id || g.id) === id);
  const gameId = game?._id || game?.id || id;
  const gameUrl = typeof (game?.url || game?.embedUrl) === 'string'
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

  const canUseIframe = Boolean(gameUrl) && (isTrustedUrl || allowUntrustedUrl);

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
      setLoadError('Game loading timed out. Please retry or open in a new tab.');
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
    if (!gameUrl) return;
    window.open(gameUrl, '_blank', 'noopener,noreferrer');
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
        'http://localhost:5000/api/ai/recommendations',
        { gameId, limit: 6 },
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
      );
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      setRecommendations(items);
      setRecommendationSource(typeof res.data?.source === 'string' ? res.data.source : '');
      if (items.length === 0) {
        setRecommendationsError('Chưa có gợi ý phù hợp cho game này.');
      }
    } catch (error) {
      setRecommendations([]);
      setRecommendationsError(error?.response?.data?.message || 'Không thể tải gợi ý AI lúc này.');
    } finally {
      setRecommendationsLoading(false);
    }
  }, [gameId]);

  const handleIframeLoaded = () => {
    clearIframeTimeout();
    setIsIframeLoading(false);
    setIsIframeLoaded(true);
    setLoadError('');
    iframeLoadedRef.current = true;
    const loadMs = iframeLoadStartRef.current ? Date.now() - iframeLoadStartRef.current : undefined;
    recordTelemetry('iframe_load_success', { loadMs });
    loadRecommendations();
  };

  const handleIframeError = () => {
    clearIframeTimeout();
    setIsIframeLoading(false);
    setIsIframeLoaded(false);
    setLoadError('Cannot load this game in iframe. Try opening it in a new tab.');
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
        <p className="text-zinc-400">Loading game...</p>
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
            <h3 className="text-xl font-black text-amber-200 mb-2">VIP-only game</h3>
            <p className="text-zinc-300 mb-6">You need an active VIP membership to play this title.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/membership" className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 font-bold hover:opacity-90 transition-opacity">
                Upgrade to VIP
              </Link>
              <Link to={`/games/${gameId}`} className="px-5 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors font-bold text-white">
                Back to Details
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
                  <p className="text-sm text-zinc-200">Loading embedded game...</p>
                  <p className="text-xs text-zinc-500">Auto-timeout after {IFRAME_TIMEOUT_MS / 1000}s</p>
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
                Retry Load
              </button>
            )}
            {canUseIframe && (
              <button
                type="button"
                onClick={toggleFullscreen}
                className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-bold transition-colors button-lift"
              >
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </button>
            )}
            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-bold transition-colors flex items-center gap-2 button-lift"
            >
              Open in New Tab <span className="text-xs">↗</span>
            </button>
            {isIframeLoaded && (
              <span className="text-xs text-emerald-300">Live</span>
            )}
          </div>
        )}

        <div className="w-full max-w-6xl mt-8 animate-fade-up" style={{ '--delay': '300ms' }}>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-bold">AI gợi ý game tương tự</h3>
              <button
                type="button"
                onClick={loadRecommendations}
                disabled={recommendationsLoading}
                className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
              >
                {recommendationsLoading ? 'Đang gợi ý...' : 'Làm mới gợi ý'}
              </button>
            </div>

            {recommendationSource && (
              <p className="text-[11px] text-zinc-500 mb-3">
                Nguồn gợi ý: <span className="text-zinc-300 font-semibold uppercase">{recommendationSource}</span>
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
                      <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{item.reason || 'Gợi ý dựa trên sở thích chơi gần đây'}</p>
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
              <p className="text-sm text-zinc-500">Chơi game rồi nhấn “Làm mới gợi ý” để lấy đề xuất tương tự.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
