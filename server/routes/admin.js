const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Game = require('../models/Game');
const Score = require('../models/Score');
const Review = require('../models/Review');
const AuditLog = require('../models/AuditLog');

const router = express.Router();

const normalizeUrl = (value) => {
  if (typeof value !== 'string') return value;
  return value.trim().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
};

const isValidHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const normalizeTag = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
};

const normalizeTags = (value) => {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const unique = [];
  const seen = new Set();
  for (const item of rawItems) {
    const normalized = normalizeTag(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }

  return unique.slice(0, 12);
};

const deriveFallbackTags = (payload = {}) => normalizeTags([
  payload.difficulty
]);

const resolveGameTags = (payload = {}) => {
  const explicitTags = normalizeTags(payload.tags);
  if (explicitTags.length > 0) return explicitTags;
  return deriveFallbackTags(payload);
};

const parseBooleanValue = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

const resolveRole = (user) => {
  if (user?.isAdmin) return 'admin';
  if (user?.role === 'admin' || user?.role === 'mod' || user?.role === 'user') {
    return user.role;
  }
  return 'user';
};

const isActiveVip = (user) => {
  if (!user || user.vipTier !== 'vip' || !user.vipExpiresAt) return false;
  const expiresAt = new Date(user.vipExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
};

const getRequestIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '';
};

const writeAuditLog = async (req, payload = {}) => {
  if (!req.user?._id) return;
  try {
    await AuditLog.create({
      actor: req.user._id,
      actorRole: req.user.role,
      action: payload.action || 'unknown_action',
      targetType: payload.targetType || 'system',
      targetId: payload.targetId || null,
      targetLabel: payload.targetLabel || '',
      details: payload.details || {},
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'] || ''
    });
  } catch (error) {
    console.error('Failed to write audit log:', error.message);
  }
};

const requireAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    const role = resolveRole(user);
    if (!user || user.deletedAt || role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    user.role = role;
    user.isAdmin = role === 'admin';
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

const requireModOrAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    const role = resolveRole(user);
    if (!user || user.deletedAt || !['admin', 'mod'].includes(role)) {
      return res.status(403).json({ message: 'Admin or Mod access required' });
    }
    user.role = role;
    user.isAdmin = role === 'admin';
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [users, games, scores, customGames, mods, deletedUsers, deletedGames] = await Promise.all([
      User.countDocuments({ deletedAt: null }),
      Game.countDocuments({ deletedAt: null }),
      Score.countDocuments(),
      Game.countDocuments({ isCustom: true, deletedAt: null }),
      User.countDocuments({ role: 'mod', deletedAt: null }),
      User.countDocuments({ deletedAt: { $ne: null } }),
      Game.countDocuments({ deletedAt: { $ne: null } })
    ]);
    res.json({ users, games, scores, customGames, mods, deletedUsers, deletedGames });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/users', requireModOrAdmin, async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true';
    const users = await User.find(includeDeleted ? {} : { deletedAt: null })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin', 'mod', 'user'].includes(role)) {
      return res.status(400).json({ message: 'Role must be admin, mod, or user' });
    }
    if (req.user._id.toString() === req.params.id && role !== 'admin') {
      return res.status(400).json({ message: 'You cannot demote yourself from admin' });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role, isAdmin: role === 'admin' },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    await writeAuditLog(req, {
      action: 'user_role_updated',
      targetType: 'user',
      targetId: user._id,
      targetLabel: user.username,
      details: { role }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/users/:id/vip', requireAdmin, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const action = typeof req.body.action === 'string' ? req.body.action.trim().toLowerCase() : 'grant';
    if (!['grant', 'revoke'].includes(action)) {
      return res.status(400).json({ message: 'Action must be grant or revoke' });
    }

    if (action === 'revoke') {
      targetUser.vipTier = 'free';
      targetUser.vipExpiresAt = null;
    } else {
      const rawDays = Number(req.body.days);
      const days = Number.isInteger(rawDays) ? Math.min(Math.max(rawDays, 1), 3650) : 30;
      const now = Date.now();
      const existingExpiry = targetUser.vipExpiresAt ? new Date(targetUser.vipExpiresAt).getTime() : 0;
      const baseTime = existingExpiry > now ? existingExpiry : now;
      targetUser.vipTier = 'vip';
      targetUser.vipExpiresAt = new Date(baseTime + days * 24 * 60 * 60 * 1000);
    }

    await targetUser.save();

    await writeAuditLog(req, {
      action: 'user_vip_updated',
      targetType: 'user',
      targetId: targetUser._id,
      targetLabel: targetUser.username,
      details: {
        vipAction: action,
        vipTier: targetUser.vipTier,
        vipExpiresAt: targetUser.vipExpiresAt,
        isVip: isActiveVip(targetUser)
      }
    });

    const responseUser = await User.findById(targetUser._id).select('-password');
    res.json(responseUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/users/:id', requireModOrAdmin, async (req, res) => {
  try {
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });
    if (targetUser.deletedAt) return res.status(400).json({ message: 'User is already deleted' });
    // Mods cannot delete admins or other mods
    const targetRole = resolveRole(targetUser);
    if (req.user.role === 'mod' && ['admin', 'mod'].includes(targetRole)) {
      return res.status(403).json({ message: 'Mods cannot delete admins or other mods' });
    }

    const now = new Date();
    await Promise.all([
      User.updateOne({ _id: targetUser._id }, { $set: { deletedAt: now, deletedBy: req.user._id } }),
      Game.updateMany(
        { addedBy: targetUser._id, isCustom: true, deletedAt: null },
        { $set: { deletedAt: now, deletedBy: req.user._id } }
      )
    ]);

    await writeAuditLog(req, {
      action: 'user_soft_deleted',
      targetType: 'user',
      targetId: targetUser._id,
      targetLabel: targetUser.username,
      details: { targetRole }
    });

    res.json({ message: 'User moved to trash' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/users/:id/restore', requireModOrAdmin, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });
    if (!targetUser.deletedAt) return res.status(400).json({ message: 'User is not deleted' });

    const targetRole = resolveRole(targetUser);
    if (req.user.role === 'mod' && ['admin', 'mod'].includes(targetRole)) {
      return res.status(403).json({ message: 'Mods cannot restore admins or other mods' });
    }

    await Promise.all([
      User.updateOne({ _id: targetUser._id }, { $set: { deletedAt: null, deletedBy: null } }),
      Game.updateMany(
        { addedBy: targetUser._id, isCustom: true },
        { $set: { deletedAt: null, deletedBy: null } }
      )
    ]);

    await writeAuditLog(req, {
      action: 'user_restored',
      targetType: 'user',
      targetId: targetUser._id,
      targetLabel: targetUser.username
    });

    res.json({ message: 'User restored' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/games', requireModOrAdmin, async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true';
    const games = await Game.find(includeDeleted ? {} : { deletedAt: null }).sort({ createdAt: -1 });
    res.json(games);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/games', requireModOrAdmin, async (req, res) => {
  try {
    const payload = { ...req.body };
    delete payload.category;
    if (!payload.title) return res.status(400).json({ message: 'Title is required' });
    payload.url = normalizeUrl(payload.url);
    if (!payload.url) {
      return res.status(400).json({ message: 'Game URL is required' });
    }
    if (!isValidHttpUrl(payload.url)) {
      return res.status(400).json({ message: 'Only HTTP/HTTPS game URLs are supported' });
    }
    const game = await Game.create({
      ...payload,
      tags: resolveGameTags(payload),
      vipOnly: parseBooleanValue(payload.vipOnly, false),
      path: undefined,
      isCustom: true,
      addedBy: req.user._id
    });
    await writeAuditLog(req, {
      action: 'game_created',
      targetType: 'game',
      targetId: game._id,
      targetLabel: game.title
    });
    res.status(201).json(game);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put('/games/:id', requireModOrAdmin, async (req, res) => {
  try {
    const payload = { ...req.body };
    delete payload.category;
    delete payload.path;
    payload.isCustom = true;
    payload.tags = resolveGameTags(payload);
    payload.vipOnly = parseBooleanValue(payload.vipOnly, false);
    if (payload.url !== undefined) {
      payload.url = normalizeUrl(payload.url);
      if (!payload.url) {
        return res.status(400).json({ message: 'Game URL is required' });
      }
      if (!isValidHttpUrl(payload.url)) {
        return res.status(400).json({ message: 'Only HTTP/HTTPS game URLs are supported' });
      }
    }
    const game = await Game.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, payload, { new: true });
    if (!game) return res.status(404).json({ message: 'Game not found' });
    await writeAuditLog(req, {
      action: 'game_updated',
      targetType: 'game',
      targetId: game._id,
      targetLabel: game.title
    });
    res.json(game);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/games/:id', requireModOrAdmin, async (req, res) => {
  try {
    const game = await Game.findById(req.params.id);
    if (!game) return res.status(404).json({ message: 'Game not found' });
    if (game.deletedAt) return res.status(400).json({ message: 'Game is already deleted' });

    game.deletedAt = new Date();
    game.deletedBy = req.user._id;
    await game.save();

    await writeAuditLog(req, {
      action: 'game_soft_deleted',
      targetType: 'game',
      targetId: game._id,
      targetLabel: game.title
    });

    res.json({ message: 'Game moved to trash' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/games/:id/restore', requireModOrAdmin, async (req, res) => {
  try {
    const game = await Game.findById(req.params.id);
    if (!game) return res.status(404).json({ message: 'Game not found' });
    if (!game.deletedAt) return res.status(400).json({ message: 'Game is not deleted' });

    game.deletedAt = null;
    game.deletedBy = null;
    await game.save();

    await writeAuditLog(req, {
      action: 'game_restored',
      targetType: 'game',
      targetId: game._id,
      targetLabel: game.title
    });

    res.json({ message: 'Game restored' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/audit-logs', requireAdmin, async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actor', 'username role')
      .lean();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
