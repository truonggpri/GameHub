const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const User = require('../models/User');
const Game = require('../models/Game');
const Payment = require('../models/Payment');

const AVATAR_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const SUPPORTED_MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

const slugifyUsernameBase = (value) => {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'user';
};

const ensureUniqueUsername = async (preferredName) => {
  const base = slugifyUsernameBase(preferredName).slice(0, 20);
  let candidate = base;
  let attempt = 0;
  while (attempt < 20) {
    const exists = await User.findOne({ username: candidate, deletedAt: null }).select('_id');
    if (!exists) return candidate;
    attempt += 1;
    candidate = `${base}_${Math.floor(Math.random() * 9999)}`.slice(0, 30);
  }
  return `user_${Date.now()}`.slice(0, 30);
};

const verifyGoogleIdToken = async (idToken) => {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Invalid Google token: ${text}`);
  }

  const payload = await response.json();
  const audience = payload?.aud || '';
  if (GOOGLE_CLIENT_ID && audience !== GOOGLE_CLIENT_ID) {
    throw new Error('Google token audience mismatch');
  }
  if (!payload?.sub) {
    throw new Error('Missing Google subject');
  }

  return {
    googleId: String(payload.sub),
    email: typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '',
    emailVerified: payload.email_verified === 'true' || payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name.trim() : '',
    picture: typeof payload.picture === 'string' ? payload.picture.trim() : ''
  };
};
const VIP_PLAN_CONFIG = {
  vip_monthly: { id: 'vip_monthly', title: 'VIP Monthly', days: 30, price: 5, currency: 'USD' },
  vip_quarterly: { id: 'vip_quarterly', title: 'VIP Quarterly', days: 90, price: 10, currency: 'USD' },
  vip_yearly: { id: 'vip_yearly', title: 'VIP Yearly', days: 365, price: 40, currency: 'USD' }
};
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_FIRST_LOGIN_OTP_TTL_MS = Number(process.env.GOOGLE_FIRST_LOGIN_OTP_TTL_MS || 10 * 60 * 1000);
const GOOGLE_FIRST_LOGIN_OTP_MAX_ATTEMPTS = Number(process.env.GOOGLE_FIRST_LOGIN_OTP_MAX_ATTEMPTS || 5);
const GOOGLE_FIRST_LOGIN_RESEND_COOLDOWN_MS = Number(process.env.GOOGLE_FIRST_LOGIN_RESEND_COOLDOWN_MS || 30 * 1000);
const pendingGoogleFirstLoginVerifications = new Map();

const maskEmail = (email = '') => {
  const [local, domain] = String(email).split('@');
  if (!local || !domain) return '';
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
};

const cleanupExpiredGoogleVerifications = () => {
  const now = Date.now();
  for (const [key, value] of pendingGoogleFirstLoginVerifications.entries()) {
    if (!value?.expiresAt || value.expiresAt <= now) {
      pendingGoogleFirstLoginVerifications.delete(key);
    }
  }
};

const generateOtpCode = () => String(crypto.randomInt(100000, 1000000));

const sendEmailVerificationCode = async ({ email, code, username }) => {
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const sender = (process.env.RESEND_FROM_EMAIL || '').trim();
  if (!resendApiKey || !sender) {
    throw new Error('Email service is not configured (missing RESEND_API_KEY or RESEND_FROM_EMAIL)');
  }

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:520px">
      <h2 style="margin-bottom:8px">Xac thuc dang nhap Google</h2>
      <p>Xin chao ${username || 'ban'},</p>
      <p>Ma xac thuc dang nhap GameHub cua ban la:</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">${code}</div>
      <p>Ma co hieu luc trong 10 phut. Vui long khong chia se ma nay.</p>
    </div>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: sender,
      to: [email],
      subject: 'GameHub - Ma xac thuc dang nhap Google',
      html
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send verification email: ${text}`);
  }
};

router.post('/google/resend-first-login-code', async (req, res) => {
  try {
    cleanupExpiredGoogleVerifications();

    const verificationToken = typeof req.body.verificationToken === 'string' ? req.body.verificationToken.trim() : '';
    if (!verificationToken) {
      return res.status(400).json({ message: 'Verification token is required' });
    }

    const pending = pendingGoogleFirstLoginVerifications.get(verificationToken);
    if (!pending || pending.expiresAt <= Date.now()) {
      pendingGoogleFirstLoginVerifications.delete(verificationToken);
      return res.status(400).json({ message: 'Verification code expired. Please sign in with Google again.' });
    }

    const now = Date.now();
    const lastSentAt = Number(pending.lastSentAt || 0);
    const elapsed = now - lastSentAt;
    if (elapsed < GOOGLE_FIRST_LOGIN_RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((GOOGLE_FIRST_LOGIN_RESEND_COOLDOWN_MS - elapsed) / 1000);
      return res.status(429).json({
        message: `Please wait ${retryAfterSeconds}s before requesting another code.`,
        retryAfterSeconds
      });
    }

    const code = generateOtpCode();
    pending.code = code;
    pending.attempts = 0;
    pending.lastSentAt = now;
    pending.expiresAt = now + GOOGLE_FIRST_LOGIN_OTP_TTL_MS;
    pendingGoogleFirstLoginVerifications.set(verificationToken, pending);

    await sendEmailVerificationCode({
      email: pending.email,
      code,
      username: pending.name || pending.usernameSeed
    });

    return res.json({
      message: 'A new verification code has been sent to your email.',
      email: maskEmail(pending.email)
    });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to resend verification code' });
  }
});

const resolveRole = (user) => {
  if (user?.isAdmin) return 'admin';
  if (user?.role === 'admin' || user?.role === 'mod' || user?.role === 'user') {
    return user.role;
  }
  return 'user';
};

const resolveVipState = (user) => {
  const vipExpiresAt = user?.vipExpiresAt ? new Date(user.vipExpiresAt) : null;
  const hasValidExpiry = vipExpiresAt && !Number.isNaN(vipExpiresAt.getTime()) && vipExpiresAt.getTime() > Date.now();
  const isVip = user?.vipTier === 'vip' && Boolean(hasValidExpiry);
  return {
    vipTier: isVip ? 'vip' : 'free',
    isVip,
    vipExpiresAt: hasValidExpiry ? vipExpiresAt.toISOString() : null
  };
};

const toUserResponse = (user) => {
  const role = resolveRole(user);
  const vipState = resolveVipState(user);
  return {
    id: user._id,
    _id: user._id,
    username: user.username,
    email: user.email || '',
    avatar: user.avatar,
    favorites: user.favorites,
    role,
    isAdmin: role === 'admin',
    vipTier: vipState.vipTier,
    isVip: vipState.isVip,
    vipExpiresAt: vipState.vipExpiresAt,
    createdAt: user.createdAt
  };
};

const isValidHttpUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const requireAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.authUserId = decoded.id;
    next();
  } catch {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Register
router.post('/register', async (req, res) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    let user = await User.findOne({ username, deletedAt: null });
    if (user) return res.status(400).json({ message: 'Username already exists' });

    if (email) {
      const existingEmail = await User.findOne({ email, deletedAt: null });
      if (existingEmail) return res.status(400).json({ message: 'Email already exists' });
    }

    user = new User({ 
      username, 
      email: email || undefined,
      password,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
    });
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(201).json({ token, user: toUserResponse(user) });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

router.post('/google/verify-first-login', async (req, res) => {
  try {
    cleanupExpiredGoogleVerifications();

    const verificationToken = typeof req.body.verificationToken === 'string' ? req.body.verificationToken.trim() : '';
    const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';

    if (!verificationToken || !code) {
      return res.status(400).json({ message: 'Verification token and code are required' });
    }

    const pending = pendingGoogleFirstLoginVerifications.get(verificationToken);
    if (!pending || pending.expiresAt <= Date.now()) {
      pendingGoogleFirstLoginVerifications.delete(verificationToken);
      return res.status(400).json({ message: 'Verification code expired. Please sign in with Google again.' });
    }

    if (pending.code !== code) {
      pending.attempts += 1;
      if (pending.attempts >= GOOGLE_FIRST_LOGIN_OTP_MAX_ATTEMPTS) {
        pendingGoogleFirstLoginVerifications.delete(verificationToken);
        return res.status(400).json({ message: 'Too many invalid attempts. Please sign in with Google again.' });
      }
      pendingGoogleFirstLoginVerifications.set(verificationToken, pending);
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    pendingGoogleFirstLoginVerifications.delete(verificationToken);

    let user = await User.findOne({ googleId: pending.googleId });
    if (!user) {
      user = await User.findOne({ email: pending.email });
    }

    if (!user) {
      const username = await ensureUniqueUsername(pending.usernameSeed);
      const randomPassword = crypto.randomBytes(24).toString('hex');
      user = new User({
        username,
        email: pending.email,
        password: randomPassword,
        googleId: pending.googleId,
        authProvider: 'google',
        avatar: pending.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
      });
    } else {
      if (user.deletedAt) {
        user.deletedAt = null;
        user.deletedBy = null;
      }
      user.googleId = pending.googleId;
      user.authProvider = 'google';
      if (!user.avatar && pending.picture) {
        user.avatar = pending.picture;
      }
    }

    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: toUserResponse(user) });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Google verification failed' });
  }
});

router.get('/vip/plans', (req, res) => {
  res.json({ plans: Object.values(VIP_PLAN_CONFIG) });
});

router.post('/vip/purchase', requireAuth, async (req, res) => {
  try {
    const planId = typeof req.body.planId === 'string' ? req.body.planId.trim() : '';
    const plan = VIP_PLAN_CONFIG[planId];
    if (!plan) {
      return res.status(400).json({ message: 'Invalid VIP plan' });
    }

    const user = await User.findOne({ _id: req.authUserId, deletedAt: null });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = Date.now();
    const existingExpiry = user.vipExpiresAt ? new Date(user.vipExpiresAt).getTime() : 0;
    const baseTime = existingExpiry > now ? existingExpiry : now;
    const nextExpiry = new Date(baseTime + plan.days * 24 * 60 * 60 * 1000);

    user.vipTier = 'vip';
    user.vipExpiresAt = nextExpiry;
    await user.save();

    res.json({
      message: `VIP activated: ${plan.title}`,
      plan,
      user: toUserResponse(user)
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to purchase VIP plan' });
  }
});

// Mock Payment API - Initiate payment
router.post('/vip/payment/initiate', requireAuth, async (req, res) => {
  try {
    const planId = typeof req.body.planId === 'string' ? req.body.planId.trim() : '';
    const plan = VIP_PLAN_CONFIG[planId];
    if (!plan) {
      return res.status(400).json({ message: 'Invalid VIP plan' });
    }

    const user = await User.findOne({ _id: req.authUserId, deletedAt: null });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Generate unique transaction ID
    const transactionId = `TXN-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Create payment record
    const payment = new Payment({
      userId: user._id,
      planId: plan.id,
      planTitle: plan.title,
      amount: plan.price,
      currency: plan.currency || 'USD',
      days: plan.days,
      status: 'pending',
      paymentMethod: req.body.paymentMethod || 'mock',
      transactionId,
      metadata: {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.socket?.remoteAddress || null
      }
    });
    await payment.save();

    res.json({
      message: 'Payment initiated. Please complete the mock payment.',
      payment: {
        id: payment._id,
        transactionId,
        planTitle: plan.title,
        amount: plan.price,
        currency: plan.currency || 'USD',
        status: 'pending',
        createdAt: payment.createdAt
      },
      // Mock payment form data
      mockPaymentUrl: `/api/auth/vip/payment/mock-page?transactionId=${transactionId}`,
      autoApproveAfterSeconds: 30 // Auto-approve after 30 seconds for demo
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to initiate payment' });
  }
});

// Mock Payment API - Verify/Complete payment
router.post('/vip/payment/verify', requireAuth, async (req, res) => {
  try {
    const { transactionId, approve } = req.body;
    if (!transactionId) {
      return res.status(400).json({ message: 'Transaction ID is required' });
    }

    const payment = await Payment.findOne({ transactionId, userId: req.authUserId });
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (payment.status !== 'pending') {
      return res.status(400).json({ message: `Payment already ${payment.status}` });
    }

    const user = await User.findOne({ _id: req.authUserId, deletedAt: null });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const plan = VIP_PLAN_CONFIG[payment.planId];

    if (approve === false) {
      // Cancel payment
      payment.status = 'cancelled';
      payment.notes = 'Cancelled by user';
      await payment.save();
      return res.json({ message: 'Payment cancelled', payment: { id: payment._id, status: 'cancelled' } });
    }

    // Approve payment (mock)
    payment.status = 'completed';
    payment.paidAt = new Date();
    payment.completedAt = new Date();
    payment.externalTransactionId = `MOCK-${Date.now()}`;
    await payment.save();

    // Activate VIP for user
    const now = Date.now();
    const existingExpiry = user.vipExpiresAt ? new Date(user.vipExpiresAt).getTime() : 0;
    const baseTime = existingExpiry > now ? existingExpiry : now;
    const nextExpiry = new Date(baseTime + payment.days * 24 * 60 * 60 * 1000);

    user.vipTier = 'vip';
    user.vipExpiresAt = nextExpiry;
    await user.save();

    // Notify admin (mark as needing notification)
    payment.notifySent = false;
    payment.adminNotified = false;
    await payment.save();

    res.json({
      message: `Payment completed. VIP activated: ${payment.planTitle}`,
      payment: {
        id: payment._id,
        transactionId,
        status: 'completed',
        planTitle: payment.planTitle,
        amount: payment.amount,
        currency: payment.currency,
        paidAt: payment.paidAt,
        vipExpiresAt: nextExpiry
      },
      user: toUserResponse(user)
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to verify payment' });
  }
});

// Get user's payment history
router.get('/vip/payments', requireAuth, async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.authUserId })
      .sort({ createdAt: -1 })
      .select('-metadata -__v');

    res.json({
      payments: payments.map(p => ({
        id: p._id,
        transactionId: p.transactionId,
        planTitle: p.planTitle,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        paymentMethod: p.paymentMethod,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        completedAt: p.completedAt
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to load payments' });
  }
});

// Admin: Get all payments
router.get('/admin/payments', requireAuth, async (req, res) => {
  try {
    // Check if user is admin
    const adminUser = await User.findOne({ _id: req.authUserId, deletedAt: null });
    if (!adminUser || !resolveRole(adminUser) === 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Payment.countDocuments(filter);
    const payments = await Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('userId', 'username email avatar');

    res.json({
      payments: payments.map(p => ({
        id: p._id,
        transactionId: p.transactionId,
        user: p.userId,
        planTitle: p.planTitle,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        paymentMethod: p.paymentMethod,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        completedAt: p.completedAt,
        adminNotified: p.adminNotified
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
        hasNextPage: skip + payments.length < total,
        hasPrevPage: Number(page) > 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to load payments' });
  }
});

// Admin: Mark payment as notified
router.patch('/admin/payments/:id/notify', requireAuth, async (req, res) => {
  try {
    const adminUser = await User.findOne({ _id: req.authUserId, deletedAt: null });
    if (!adminUser || !resolveRole(adminUser) === 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    payment.adminNotified = true;
    payment.notifySent = true;
    await payment.save();

    res.json({ message: 'Payment marked as notified', payment: { id: payment._id, adminNotified: true } });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to update payment' });
  }
});

// Admin: Get payment statistics
router.get('/admin/payments/stats', requireAuth, async (req, res) => {
  try {
    const adminUser = await User.findOne({ _id: req.authUserId, deletedAt: null });
    if (!adminUser || !resolveRole(adminUser) === 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const stats = await Payment.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] } }
        }
      }
    ]);

    const pendingCount = await Payment.countDocuments({ status: 'pending', adminNotified: false });

    const statusMap = {};
    stats.forEach(s => { statusMap[s._id] = { count: s.count, totalAmount: s.totalAmount }; });

    res.json({
      stats: {
        pending: statusMap.pending?.count || 0,
        completed: statusMap.completed?.count || 0,
        failed: statusMap.failed?.count || 0,
        cancelled: statusMap.cancelled?.count || 0,
        totalRevenue: statusMap.completed?.totalAmount || 0,
        awaitingNotification: pendingCount
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to load payment stats' });
  }
});

router.post('/profile/avatar', requireAuth, async (req, res) => {
  try {
    const imageData = typeof req.body.imageData === 'string' ? req.body.imageData.trim() : '';
    if (!imageData.startsWith('data:image/')) {
      return res.status(400).json({ message: 'Invalid avatar payload' });
    }

    const match = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ message: 'Invalid avatar data format' });
    }

    const mimeType = match[1].toLowerCase();
    const extension = SUPPORTED_MIME_EXT[mimeType];
    if (!extension) {
      return res.status(400).json({ message: 'Only PNG, JPEG, WEBP, or GIF avatars are supported' });
    }

    const fileBuffer = Buffer.from(match[2], 'base64');
    if (!fileBuffer.length || fileBuffer.length > MAX_AVATAR_BYTES) {
      return res.status(400).json({ message: 'Avatar must be between 1 byte and 3MB' });
    }

    await fs.promises.mkdir(AVATAR_UPLOAD_DIR, { recursive: true });

    const filename = `avatar-${req.authUserId}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
    const absolutePath = path.join(AVATAR_UPLOAD_DIR, filename);
    await fs.promises.writeFile(absolutePath, fileBuffer);

    const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/avatars/${filename}`;
    const user = await User.findOne({ _id: req.authUserId, deletedAt: null });
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.avatar = avatarUrl;
    await user.save();

    res.status(201).json({ avatarUrl, user: toUserResponse(user) });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to upload avatar' });
  }
});

router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const avatarRaw = typeof req.body.avatar === 'string' ? req.body.avatar.trim() : '';

    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }

    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ message: 'Username must be between 3 and 30 characters' });
    }

    const conflictUser = await User.findOne({
      _id: { $ne: req.authUserId },
      username,
      deletedAt: null
    });
    if (conflictUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    if (avatarRaw && !isValidHttpUrl(avatarRaw)) {
      return res.status(400).json({ message: 'Avatar URL must be a valid HTTP/HTTPS URL' });
    }

    const user = await User.findOne({ _id: req.authUserId, deletedAt: null });
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.username = username;
    user.avatar = avatarRaw;
    await user.save();

    res.json({ user: toUserResponse(user) });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const identifierRaw = req.body.identifier || req.body.username || req.body.email;
    const identifier = typeof identifierRaw === 'string' ? identifierRaw.trim() : '';
    const normalizedEmail = identifier.toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Username/email and password are required' });
    }

    const user = await User.findOne({
      $and: [
        { deletedAt: null },
        { $or: [{ username: identifier }, { email: normalizedEmail }] }
      ]
    });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: toUserResponse(user) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/google', async (req, res) => {
  try {
    const idToken = typeof req.body.idToken === 'string' ? req.body.idToken.trim() : '';
    if (!idToken) {
      return res.status(400).json({ message: 'Google token is required' });
    }

    const googleProfile = await verifyGoogleIdToken(idToken);
    if (!googleProfile.email || !googleProfile.emailVerified) {
      return res.status(400).json({ message: 'Google email is missing or not verified' });
    }

    let user = await User.findOne({ googleId: googleProfile.googleId });

    if (!user) {
      user = await User.findOne({ email: googleProfile.email });
    }

    if (user) {
      if (user.deletedAt) {
        user.deletedAt = null;
        user.deletedBy = null;
      }
      if (user.googleId !== googleProfile.googleId) {
        user.googleId = googleProfile.googleId;
      }
      if (user.email !== googleProfile.email) {
        user.email = googleProfile.email;
      }
      user.authProvider = 'google';
      if (!user.avatar && googleProfile.picture) {
        user.avatar = googleProfile.picture;
      }
      await user.save();
    }

    if (!user) {
      cleanupExpiredGoogleVerifications();
      const usernameSeed = googleProfile.name || googleProfile.email.split('@')[0] || 'google_user';
      const code = generateOtpCode();
      const verificationToken = crypto.randomBytes(24).toString('hex');

      pendingGoogleFirstLoginVerifications.set(verificationToken, {
        code,
        email: googleProfile.email,
        googleId: googleProfile.googleId,
        name: googleProfile.name,
        picture: googleProfile.picture,
        usernameSeed,
        attempts: 0,
        lastSentAt: Date.now(),
        expiresAt: Date.now() + GOOGLE_FIRST_LOGIN_OTP_TTL_MS
      });

      await sendEmailVerificationCode({
        email: googleProfile.email,
        code,
        username: googleProfile.name || usernameSeed
      });

      return res.status(202).json({
        requiresVerification: true,
        verificationToken,
        email: maskEmail(googleProfile.email),
        message: 'Verification code sent to your email. Please verify to complete sign-in.'
      });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: toUserResponse(user) });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Google sign-in failed' });
  }
});

// Get Current User
router.get('/me', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ _id: decoded.id, deletedAt: null }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(toUserResponse(user));
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
});

// Update Favorites
router.put('/favorites', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { gameId } = req.body;
    
    const user = await User.findOne({ _id: decoded.id, deletedAt: null });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const hadFavorite = user.favorites.includes(gameId);
    if (hadFavorite) {
      user.favorites = user.favorites.filter(id => id !== gameId);
    } else {
      user.favorites.push(gameId);
    }
    await user.save();

    const targetGame = await Game.findById(gameId).select('_id likeCount');
    if (targetGame) {
      const delta = hadFavorite ? -1 : 1;
      targetGame.likeCount = Math.max(0, Number(targetGame.likeCount || 0) + delta);
      await targetGame.save();
    }

    res.json(user.favorites);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Stripe: Create checkout session
router.post('/vip/payment/stripe/create-checkout', requireAuth, async (req, res) => {
  try {
    console.log('Stripe checkout - req.authUserId:', req.authUserId);
    console.log('Stripe checkout - req.body:', req.body);
    
    const planId = typeof req.body.planId === 'string' ? req.body.planId.trim() : '';
    const plan = VIP_PLAN_CONFIG[planId];
    if (!plan) {
      return res.status(400).json({ message: 'Invalid VIP plan' });
    }

    const user = await User.findOne({ _id: req.authUserId, deletedAt: null });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const transactionId = `TXN-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Create Stripe customer if not exists
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.username,
        metadata: { userId: String(user._id) }
      });
      stripeCustomerId = customer.id;
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    }

    // Create payment record
    const payment = new Payment({
      userId: user._id,
      planId: plan.id,
      planTitle: plan.title,
      amount: plan.price,
      currency: plan.currency || 'USD',
      days: plan.days,
      status: 'pending',
      paymentMethod: 'stripe',
      transactionId,
      stripeCustomerId,
      metadata: {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.socket?.remoteAddress || null
      }
    });
    await payment.save();

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: plan.currency?.toLowerCase() || 'usd',
          product_data: {
            name: `GameHub ${plan.title}`,
            description: `${plan.days} days VIP access`,
          },
          unit_amount: plan.price * 100, // Convert USD to cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.STRIPE_SUCCESS_URL || 'http://localhost:5173/payment/success'}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.STRIPE_CANCEL_URL || 'http://localhost:5173/payment/cancel'}?session_id={CHECKOUT_SESSION_ID}`,
      metadata: {
        paymentId: String(payment._id),
        userId: String(user._id),
        planId: plan.id,
        transactionId
      }
    });

    // Save Stripe session ID
    payment.stripeSessionId = session.id;
    await payment.save();

    res.json({
      message: 'Stripe checkout session created',
      checkoutUrl: session.url,
      sessionId: session.id,
      transactionId
    });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ message: error.message || 'Unable to create checkout session' });
  }
});

// Stripe: Get checkout session status
router.get('/vip/payment/stripe/session/:sessionId', requireAuth, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    const payment = await Payment.findOne({ stripeSessionId: req.params.sessionId, userId: req.authUserId });

    res.json({
      session: {
        id: session.id,
        status: session.status,
        payment_status: session.payment_status,
        amount_total: session.amount_total,
        currency: session.currency
      },
      payment: payment ? {
        id: payment._id,
        status: payment.status,
        transactionId: payment.transactionId
      } : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to retrieve session' });
  }
});

// Stripe: Webhook handler (public endpoint - no auth required)
router.post('/vip/payment/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (endpointSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } else {
      // For development without webhook secret
      event = JSON.parse(req.body);
    }
  } catch (err) {
    console.error('Stripe webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('Stripe webhook received:', event.type);

  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { paymentId, userId, planId, transactionId } = session.metadata || {};

    try {
      // Find and update payment
      const payment = await Payment.findById(paymentId);
      if (payment && payment.status === 'pending') {
        payment.status = 'completed';
        payment.paidAt = new Date();
        payment.completedAt = new Date();
        payment.stripePaymentIntentId = session.payment_intent;
        payment.externalTransactionId = session.payment_intent;
        await payment.save();

        // Activate VIP for user
        const user = await User.findById(userId);
        if (user) {
          const plan = VIP_PLAN_CONFIG[planId];
          if (plan) {
            const now = Date.now();
            const existingExpiry = user.vipExpiresAt ? new Date(user.vipExpiresAt).getTime() : 0;
            const baseTime = existingExpiry > now ? existingExpiry : now;
            const nextExpiry = new Date(baseTime + plan.days * 24 * 60 * 60 * 1000);

            user.vipTier = 'vip';
            user.vipExpiresAt = nextExpiry;
            await user.save();
          }
        }

        console.log('Payment completed via webhook:', transactionId);
      }
    } catch (err) {
      console.error('Error processing webhook:', err);
    }
  }

  // Handle payment_intent.payment_failed
  if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object;
    const sessionId = paymentIntent.metadata?.sessionId;

    try {
      const payment = await Payment.findOne({ stripeSessionId: sessionId });
      if (payment && payment.status === 'pending') {
        payment.status = 'failed';
        payment.notes = paymentIntent.last_payment_error?.message || 'Payment failed';
        await payment.save();
      }
    } catch (err) {
      console.error('Error marking payment as failed:', err);
    }
  }

  res.json({ received: true });
});

// Stripe: Verify payment by session (for success page)
router.post('/vip/payment/stripe/verify', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ message: 'Session ID is required' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const payment = await Payment.findOne({ stripeSessionId: sessionId, userId: req.authUserId });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (session.payment_status === 'paid' && payment.status === 'pending') {
      // Update payment status
      payment.status = 'completed';
      payment.paidAt = new Date();
      payment.completedAt = new Date();
      payment.stripePaymentIntentId = session.payment_intent;
      payment.externalTransactionId = session.payment_intent;
      await payment.save();

      // Activate VIP
      const user = await User.findOne({ _id: req.authUserId, deletedAt: null });
      const plan = VIP_PLAN_CONFIG[payment.planId];
      if (user && plan) {
        const now = Date.now();
        const existingExpiry = user.vipExpiresAt ? new Date(user.vipExpiresAt).getTime() : 0;
        const baseTime = existingExpiry > now ? existingExpiry : now;
        const nextExpiry = new Date(baseTime + plan.days * 24 * 60 * 60 * 1000);

        user.vipTier = 'vip';
        user.vipExpiresAt = nextExpiry;
        await user.save();

        return res.json({
          success: true,
          message: 'Payment successful! VIP activated.',
          payment: {
            id: payment._id,
            transactionId: payment.transactionId,
            status: 'completed',
            planTitle: payment.planTitle
          },
          user: toUserResponse(user)
        });
      }
    }

    res.json({
      success: session.payment_status === 'paid',
      payment_status: session.payment_status,
      payment: {
        id: payment._id,
        status: payment.status,
        transactionId: payment.transactionId
      }
    });
  } catch (error) {
    console.error('Stripe verify error:', error);
    res.status(500).json({ message: error.message || 'Unable to verify payment' });
  }
});

module.exports = router;
