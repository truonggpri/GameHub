const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const User = require('../models/User');

const AVATAR_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const SUPPORTED_MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};
const VIP_PLAN_CONFIG = {
  vip_monthly: { id: 'vip_monthly', title: 'VIP Monthly', days: 30, price: 99000, currency: 'VND' },
  vip_quarterly: { id: 'vip_quarterly', title: 'VIP Quarterly', days: 90, price: 249000, currency: 'VND' },
  vip_yearly: { id: 'vip_yearly', title: 'VIP Yearly', days: 365, price: 899000, currency: 'VND' }
};

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
    if (user.favorites.includes(gameId)) {
      user.favorites = user.favorites.filter(id => id !== gameId);
    } else {
      user.favorites.push(gameId);
    }
    await user.save();
    res.json(user.favorites);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
