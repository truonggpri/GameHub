import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const normalizeUserRole = (value) => {
  if (value?.isAdmin) return 'admin';
  if (value?.role === 'admin' || value?.role === 'mod' || value?.role === 'user') {
    return value.role;
  }
  return 'user';
};

const normalizeAuthUser = (value) => {
  if (!value || typeof value !== 'object') return null;
  const role = normalizeUserRole(value);
  const vipExpiresAt = typeof value.vipExpiresAt === 'string' && value.vipExpiresAt ? value.vipExpiresAt : null;
  const vipExpiresMs = vipExpiresAt ? new Date(vipExpiresAt).getTime() : 0;
  const isVip = value.isVip === true || (value.vipTier === 'vip' && Number.isFinite(vipExpiresMs) && vipExpiresMs > Date.now());
  return {
    ...value,
    role,
    isAdmin: role === 'admin',
    vipTier: isVip ? 'vip' : 'free',
    isVip,
    vipExpiresAt: isVip ? vipExpiresAt : null,
    favorites: Array.isArray(value.favorites) ? value.favorites : []
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Set base URL for axios
  const api = axios.create({
    baseURL: (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, ''),
  });

  // Add token to requests if it exists
  api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Load user from API on initial render
  useEffect(() => {
    const loadUser = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await api.get('/auth/me');
        setUser(normalizeAuthUser(res.data));
      } catch (error) {
        console.error("Failed to load user:", error);
        localStorage.removeItem('token');
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = async (identifier, password) => {
    try {
      const res = await api.post('/auth/login', { identifier, password });
      localStorage.setItem('token', res.data.token);
      setUser(normalizeAuthUser(res.data.user));
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Login failed' 
      };
    }
  };

  const signup = async (username, email, password) => {
    try {
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const res = await api.post('/auth/register', {
        username,
        email: normalizedEmail || undefined,
        password
      });
      localStorage.setItem('token', res.data.token);
      setUser(normalizeAuthUser(res.data.user));
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Signup failed' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const toggleFavorite = async (gameId) => {
    if (!user) return;

    // Optimistic update
    const isFavorite = user.favorites.includes(gameId);
    const newFavorites = isFavorite
      ? user.favorites.filter(id => id !== gameId)
      : [...user.favorites, gameId];
    
    setUser({ ...user, favorites: newFavorites });

    try {
      await api.put('/auth/favorites', { gameId });
    } catch (error) {
      console.error("Failed to update favorites", error);
      // Revert if failed (optional, for now just log)
    }
  };

  const addGameHistory = async (gameId, score, options = {}) => {
    if (!user) return;

    try {
      await api.post('/scores', {
        gameId,
        score,
        activityType: options.activityType || 'match_end',
        result: options.result || 'completed',
        durationSeconds: options.durationSeconds || 0,
        metadata: options.metadata || {}
      });
    } catch (error) {
      console.error("Failed to save score", error);
    }
  };

  const updateProfile = async ({ username, avatar }) => {
    try {
      const payload = {
        username: typeof username === 'string' ? username.trim() : '',
        avatar: typeof avatar === 'string' ? avatar.trim() : ''
      };
      const res = await api.patch('/auth/profile', payload);
      const nextUser = normalizeAuthUser(res.data?.user || res.data);
      setUser(nextUser);
      return { success: true, user: nextUser };
    } catch (error) {
      return {
        success: false,
        message: error?.response?.data?.message || 'Unable to update profile'
      };
    }
  };

  const uploadAvatar = async (file) => {
    try {
      if (!(file instanceof File)) {
        return { success: false, message: 'Invalid avatar file' };
      }

      const imageData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('Unable to read avatar file'));
        reader.readAsDataURL(file);
      });

      if (!imageData) {
        return { success: false, message: 'Unable to read avatar file' };
      }

      const res = await api.post('/auth/profile/avatar', { imageData });
      const nextUser = normalizeAuthUser(res.data?.user || res.data);
      setUser(nextUser);
      return { success: true, avatarUrl: res.data?.avatarUrl || nextUser?.avatar || '', user: nextUser };
    } catch (error) {
      return {
        success: false,
        message: error?.response?.data?.message || 'Unable to upload avatar'
      };
    }
  };

  const getVipPlans = async () => {
    try {
      const res = await api.get('/auth/vip/plans');
      return {
        success: true,
        plans: Array.isArray(res.data?.plans) ? res.data.plans : []
      };
    } catch (error) {
      return {
        success: false,
        message: error?.response?.data?.message || 'Unable to load VIP plans',
        plans: []
      };
    }
  };

  const purchaseVip = async (planId) => {
    try {
      const res = await api.post('/auth/vip/purchase', { planId });
      const nextUser = normalizeAuthUser(res.data?.user || res.data);
      setUser(nextUser);
      return {
        success: true,
        user: nextUser,
        plan: res.data?.plan,
        message: res.data?.message || 'VIP activated successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: error?.response?.data?.message || 'Unable to purchase VIP plan'
      };
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, loading, toggleFavorite, addGameHistory, updateProfile, uploadAvatar, getVipPlans, purchaseVip }}>
      {children}
    </AuthContext.Provider>
  );
};
