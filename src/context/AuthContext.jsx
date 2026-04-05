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

  const startForgotPassword = async (identifier) => {
    try {
      const identifierValue = typeof identifier === 'string' ? identifier.trim() : '';
      if (!identifierValue) {
        return { success: false, message: 'Username or email is required' };
      }

      const res = await api.post('/auth/forgot-password/start', { identifier: identifierValue });
      return {
        success: true,
        requiresVerification: Boolean(res.data?.requiresVerification),
        provider: res.data?.provider || 'local',
        resetToken: res.data?.resetToken || '',
        email: res.data?.email || '',
        message: res.data?.message || ''
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Unable to start forgot password flow'
      };
    }
  };

  const resetForgotPasswordLocal = async (identifier, newPassword) => {
    try {
      const identifierValue = typeof identifier === 'string' ? identifier.trim() : '';
      const passwordValue = typeof newPassword === 'string' ? newPassword : '';
      if (!identifierValue || !passwordValue) {
        return { success: false, message: 'Username/email and new password are required' };
      }

      const res = await api.post('/auth/forgot-password/reset-local', {
        identifier: identifierValue,
        newPassword: passwordValue
      });

      return {
        success: true,
        message: res.data?.message || 'Password has been reset successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Unable to reset password'
      };
    }
  };

  const verifyGoogleForgotPasswordCode = async (resetToken, code) => {
    try {
      const tokenValue = typeof resetToken === 'string' ? resetToken.trim() : '';
      const codeValue = typeof code === 'string' ? code.trim() : '';
      if (!tokenValue || !codeValue) {
        return { success: false, message: 'Reset token and OTP code are required' };
      }

      const res = await api.post('/auth/forgot-password/google/verify-code', {
        resetToken: tokenValue,
        code: codeValue
      });

      return {
        success: true,
        message: res.data?.message || 'OTP verified'
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Unable to verify OTP code'
      };
    }
  };

  const resendGoogleForgotPasswordCode = async (resetToken) => {
    try {
      const tokenValue = typeof resetToken === 'string' ? resetToken.trim() : '';
      if (!tokenValue) {
        return { success: false, message: 'Reset token is required' };
      }

      const res = await api.post('/auth/forgot-password/google/resend-code', {
        resetToken: tokenValue
      });

      return {
        success: true,
        message: res.data?.message || 'A new OTP code has been sent',
        email: res.data?.email || '',
        retryAfterSeconds: 0
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Unable to resend OTP code',
        retryAfterSeconds: Number(error.response?.data?.retryAfterSeconds || 0)
      };
    }
  };

  const resetForgotPasswordGoogle = async (resetToken, newPassword) => {
    try {
      const tokenValue = typeof resetToken === 'string' ? resetToken.trim() : '';
      const passwordValue = typeof newPassword === 'string' ? newPassword : '';
      if (!tokenValue || !passwordValue) {
        return { success: false, message: 'Reset token and new password are required' };
      }

      const res = await api.post('/auth/forgot-password/google/reset', {
        resetToken: tokenValue,
        newPassword: passwordValue
      });

      return {
        success: true,
        message: res.data?.message || 'Password has been reset successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Unable to reset password'
      };
    }
  };

  const resendGoogleFirstLoginCode = async (verificationToken) => {
    try {
      const tokenValue = typeof verificationToken === 'string' ? verificationToken.trim() : '';
      if (!tokenValue) {
        return { success: false, message: 'Verification token is required' };
      }

      const res = await api.post('/auth/google/resend-first-login-code', {
        verificationToken: tokenValue
      });

      return {
        success: true,
        message: res.data?.message || 'A new verification code has been sent to your email.',
        email: res.data?.email || ''
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Unable to resend verification code',
        retryAfterSeconds: Number(error.response?.data?.retryAfterSeconds || 0)
      };
    }
  };

  const verifyGoogleFirstLogin = async (verificationToken, code) => {
    try {
      const tokenValue = typeof verificationToken === 'string' ? verificationToken.trim() : '';
      const codeValue = typeof code === 'string' ? code.trim() : '';
      if (!tokenValue || !codeValue) {
        return { success: false, message: 'Verification token and code are required' };
      }

      const res = await api.post('/auth/google/verify-first-login', {
        verificationToken: tokenValue,
        code: codeValue
      });

      localStorage.setItem('token', res.data.token);
      setUser(normalizeAuthUser(res.data.user));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Google verification failed'
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

  const googleLogin = async (idToken) => {
    try {
      const tokenValue = typeof idToken === 'string' ? idToken.trim() : '';
      if (!tokenValue) {
        return { success: false, message: 'Google token is required' };
      }
      const res = await api.post('/auth/google', { idToken: tokenValue });
      if (res.data?.requiresVerification) {
        return {
          success: false,
          requiresVerification: true,
          verificationToken: res.data.verificationToken || '',
          email: res.data.email || '',
          message: res.data.message || 'Verification code sent to your email'
        };
      }
      localStorage.setItem('token', res.data.token);
      setUser(normalizeAuthUser(res.data.user));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Google login failed'
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

  const initiatePayment = async (planId, paymentMethod = 'mock') => {
    try {
      const res = await api.post('/auth/vip/payment/initiate', { planId, paymentMethod });
      return {
        success: true,
        payment: res.data?.payment,
        mockPaymentUrl: res.data?.mockPaymentUrl,
        autoApproveAfterSeconds: res.data?.autoApproveAfterSeconds,
        message: res.data?.message || 'Payment initiated'
      };
    } catch (error) {
      return {
        success: false,
        message: error?.response?.data?.message || 'Unable to initiate payment'
      };
    }
  };

  const verifyPayment = async (transactionId, approve = true) => {
    try {
      const res = await api.post('/auth/vip/payment/verify', { transactionId, approve });
      const nextUser = normalizeAuthUser(res.data?.user || res.data);
      if (nextUser) setUser(nextUser);
      return {
        success: true,
        payment: res.data?.payment,
        user: nextUser,
        message: res.data?.message || 'Payment verified'
      };
    } catch (error) {
      return {
        success: false,
        message: error?.response?.data?.message || 'Unable to verify payment'
      };
    }
  };

  const getPaymentHistory = async () => {
    try {
      const res = await api.get('/auth/vip/payments');
      return {
        success: true,
        payments: res.data?.payments || []
      };
    } catch (error) {
      return {
        success: false,
        message: error?.response?.data?.message || 'Unable to load payment history',
        payments: []
      };
    }
  };

  const getAdminPayments = async (params = {}) => {
    try {
      const res = await api.get('/auth/admin/payments', { params });
      return {
        success: true,
        payments: res.data?.payments || [],
        pagination: res.data?.pagination
      };
    } catch (error) {
      return {
        success: false,
        message: error?.response?.data?.message || 'Unable to load admin payments',
        payments: [],
        pagination: null
      };
    }
  };

  const getAdminPaymentStats = async () => {
    try {
      const res = await api.get('/auth/admin/payments/stats');
      return {
        success: true,
        stats: res.data?.stats || {}
      };
    } catch (error) {
      return {
        success: false,
        message: error?.response?.data?.message || 'Unable to load payment stats',
        stats: {}
      };
    }
  };

  const markPaymentNotified = async (paymentId) => {
    try {
      const res = await api.patch(`/auth/admin/payments/${paymentId}/notify`);
      return {
        success: true,
        message: res.data?.message || 'Payment marked as notified'
      };
    } catch (error) {
      return {
        success: false,
        message: error?.response?.data?.message || 'Unable to mark payment'
      };
    }
  };

  const createStripeCheckout = async (planId) => {
    try {
      const res = await api.post('/auth/vip/payment/stripe/create-checkout', { planId });
      return {
        success: true,
        checkoutUrl: res.data?.checkoutUrl,
        sessionId: res.data?.sessionId,
        transactionId: res.data?.transactionId,
        message: res.data?.message || 'Checkout session created'
      };
    } catch (error) {
      return {
        success: false,
        message: error?.response?.data?.message || 'Unable to create checkout session'
      };
    }
  };

  const verifyStripePayment = async (sessionId) => {
    try {
      const res = await api.post('/auth/vip/payment/stripe/verify', { sessionId });
      if (res.data?.user) {
        setUser(normalizeAuthUser(res.data.user));
      }
      return {
        success: res.data?.success || false,
        payment: res.data?.payment,
        user: res.data?.user ? normalizeAuthUser(res.data.user) : null,
        message: res.data?.message || 'Payment verification completed'
      };
    } catch (error) {
      return {
        success: false,
        message: error?.response?.data?.message || 'Unable to verify payment'
      };
    }
  };

  const getStripeSession = async (sessionId) => {
    try {
      const res = await api.get(`/auth/vip/payment/stripe/session/${sessionId}`);
      return {
        success: true,
        session: res.data?.session,
        payment: res.data?.payment
      };
    } catch (error) {
      return {
        success: false,
        message: error?.response?.data?.message || 'Unable to retrieve session'
      };
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, startForgotPassword, resetForgotPasswordLocal, verifyGoogleForgotPasswordCode, resendGoogleForgotPasswordCode, resetForgotPasswordGoogle, googleLogin, verifyGoogleFirstLogin, resendGoogleFirstLoginCode, logout, loading, toggleFavorite, addGameHistory, updateProfile, uploadAvatar, getVipPlans, purchaseVip, initiatePayment, verifyPayment, getPaymentHistory, getAdminPayments, getAdminPaymentStats, markPaymentNotified, createStripeCheckout, verifyStripePayment, getStripeSession }}>
      {children}
    </AuthContext.Provider>
  );
};
