import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';

const CustomGamesContext = createContext();
const AUTO_REFRESH_INTERVAL_MS = 45000;
const FOCUS_REFRESH_COOLDOWN_MS = 8000;

export const useCustomGames = () => useContext(CustomGamesContext);

export const CustomGamesProvider = ({ children }) => {
  const [customGames, setCustomGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const lastRefreshAtRef = useRef(0);

  const shouldSkipAutoRefresh = useCallback(() => {
    const pathname = window.location.pathname || '';
    return pathname.startsWith('/games/play/');
  }, []);

  const api = useMemo(() => {
    const instance = axios.create({
      baseURL: (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, ''),
    });
    instance.interceptors.request.use(config => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
    return instance;
  }, []);

  const refreshCustomGames = useCallback(async () => {
    try {
      const res = await api.get('/games');
      const embeddedGames = Array.isArray(res.data)
        ? res.data.filter((game) => {
            const hasPlayableUrl = typeof (game.url || game.embedUrl) === 'string' && (game.url || game.embedUrl).trim() !== '';
            return hasPlayableUrl || Boolean(game?.vipOnly);
          })
        : [];
      setCustomGames(embeddedGames);
      lastRefreshAtRef.current = Date.now();
      return embeddedGames;
    } catch (error) {
      console.error("Failed to fetch games:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refreshCustomGames().catch(() => {});
  }, [refreshCustomGames]);

  useEffect(() => {
    const runRefreshIfNeeded = () => {
      if (document.hidden) return;
      if (shouldSkipAutoRefresh()) return;
      const elapsed = Date.now() - lastRefreshAtRef.current;
      if (elapsed < FOCUS_REFRESH_COOLDOWN_MS) return;
      refreshCustomGames().catch(() => {});
    };

    const onVisibilityChange = () => {
      if (!document.hidden) {
        runRefreshIfNeeded();
      }
    };

    window.addEventListener('focus', runRefreshIfNeeded);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', runRefreshIfNeeded);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshCustomGames, shouldSkipAutoRefresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (shouldSkipAutoRefresh()) return;
      refreshCustomGames().catch(() => {});
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [refreshCustomGames, shouldSkipAutoRefresh]);

  const addCustomGame = async (gameData) => {
    try {
      const res = await api.post('/games', {
        ...gameData,
        isCustom: true,
        color: 'group-hover:shadow-[0_0_30px_rgba(255,165,0,0.5)]'
      });
      setCustomGames(prev => [...prev, res.data]);
      return res.data;
    } catch (error) {
      console.error("Failed to add game:", error);
      throw error;
    }
  };

  const removeCustomGame = async (gameId) => {
    try {
      await api.delete(`/games/${gameId}`);
      setCustomGames(prev => prev.filter(g => g._id !== gameId));
    } catch (error) {
      console.error("Failed to delete game:", error);
      throw error;
    }
  };

  return (
    <CustomGamesContext.Provider value={{ customGames, addCustomGame, removeCustomGame, refreshCustomGames, loading }}>
      {children}
    </CustomGamesContext.Provider>
  );
};
