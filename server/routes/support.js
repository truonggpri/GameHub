const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');

const router = express.Router();

const resolveRole = (user) => {
  if (user?.isAdmin) return 'admin';
  if (user?.role === 'admin' || user?.role === 'mod' || user?.role === 'user') {
    return user.role;
  }
  return 'user';
};

const requireAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ _id: decoded.id, deletedAt: null }).select('_id username role isAdmin');
    if (!user) return res.status(404).json({ message: 'User not found' });
    req.user = {
      _id: user._id,
      username: user.username,
      role: resolveRole(user),
      isAdmin: resolveRole(user) === 'admin'
    };
    next();
  } catch {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

const isStaff = (user) => ['admin', 'mod'].includes(user?.role);

const normalizeCategory = (value) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (['vip', 'game', 'billing', 'account', 'other'].includes(raw)) return raw;
  return 'other';
};

const normalizeStatus = (value) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (['open', 'pending', 'resolved', 'closed'].includes(raw)) return raw;
  return '';
};

const formatTicket = (ticket) => {
  const messages = Array.isArray(ticket.messages)
    ? ticket.messages.map((item) => ({
        id: item._id,
        sender: item.sender
          ? {
              _id: item.sender._id,
              username: item.sender.username,
              role: item.sender.role
            }
          : null,
        senderRole: item.senderRole,
        content: item.content,
        createdAt: item.createdAt
      }))
    : [];

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  return {
    id: ticket._id,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    gameId: ticket.gameId || '',
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    lastMessageAt: ticket.lastMessageAt,
    lastMessage,
    assignedTo: ticket.assignedTo
      ? {
          _id: ticket.assignedTo._id,
          username: ticket.assignedTo.username,
          role: ticket.assignedTo.role
        }
      : null,
    user: ticket.user
      ? {
          _id: ticket.user._id,
          username: ticket.user.username,
          role: ticket.user.role
        }
      : null,
    messages
  };
};

const ensureTicketAccess = (ticket, user) => {
  if (!ticket) return false;
  if (isStaff(user)) return true;
  return ticket.user?._id?.toString() === user._id.toString();
};

router.get('/tickets', requireAuth, async (req, res) => {
  try {
    const query = {};
    const status = normalizeStatus(req.query.status);
    if (status) query.status = status;

    if (!isStaff(req.user)) {
      query.user = req.user._id;
    }

    const tickets = await SupportTicket.find(query)
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .limit(isStaff(req.user) ? 300 : 120)
      .populate('user', 'username role isAdmin')
      .populate('assignedTo', 'username role isAdmin')
      .populate('messages.sender', 'username role isAdmin')
      .lean();

    res.json(tickets.map(formatTicket));
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to load support tickets' });
  }
});

router.post('/tickets', requireAuth, async (req, res) => {
  try {
    const subject = typeof req.body.subject === 'string' ? req.body.subject.trim() : '';
    const content = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    const gameId = typeof req.body.gameId === 'string' ? req.body.gameId.trim() : '';
    if (!subject || subject.length < 3) {
      return res.status(400).json({ message: 'Subject must be at least 3 characters' });
    }
    if (!content || content.length < 3) {
      return res.status(400).json({ message: 'Message must be at least 3 characters' });
    }

    const now = new Date();
    const category = normalizeCategory(req.body.category);
    const ticket = await SupportTicket.create({
      user: req.user._id,
      subject,
      category,
      status: 'open',
      gameId,
      messages: [{
        sender: req.user._id,
        senderRole: req.user.role,
        content,
        createdAt: now
      }],
      lastMessageAt: now
    });

    const populated = await SupportTicket.findById(ticket._id)
      .populate('user', 'username role isAdmin')
      .populate('assignedTo', 'username role isAdmin')
      .populate('messages.sender', 'username role isAdmin')
      .lean();

    res.status(201).json(formatTicket(populated));
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to create support ticket' });
  }
});

router.get('/tickets/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ticket id' });
    }

    const ticket = await SupportTicket.findById(req.params.id)
      .populate('user', 'username role isAdmin')
      .populate('assignedTo', 'username role isAdmin')
      .populate('messages.sender', 'username role isAdmin')
      .lean();

    if (!ensureTicketAccess(ticket, req.user)) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json(formatTicket(ticket));
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to load support ticket' });
  }
});

router.post('/tickets/:id/messages', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ticket id' });
    }

    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content || content.length < 1) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    const ticket = await SupportTicket.findById(req.params.id).populate('user', '_id');
    if (!ensureTicketAccess(ticket, req.user)) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    ticket.messages.push({
      sender: req.user._id,
      senderRole: req.user.role,
      content,
      createdAt: new Date()
    });

    if (isStaff(req.user)) {
      if (!ticket.assignedTo) {
        ticket.assignedTo = req.user._id;
      }
      if (ticket.status === 'open') {
        ticket.status = 'pending';
      }
    } else if (ticket.status === 'resolved' || ticket.status === 'closed') {
      ticket.status = 'open';
    }

    ticket.lastMessageAt = new Date();
    await ticket.save();

    const populated = await SupportTicket.findById(ticket._id)
      .populate('user', 'username role isAdmin')
      .populate('assignedTo', 'username role isAdmin')
      .populate('messages.sender', 'username role isAdmin')
      .lean();

    res.status(201).json(formatTicket(populated));
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to send support message' });
  }
});

router.patch('/tickets/:id/status', requireAuth, async (req, res) => {
  try {
    if (!isStaff(req.user)) {
      return res.status(403).json({ message: 'Admin or Mod access required' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ticket id' });
    }

    const status = normalizeStatus(req.body.status);
    if (!status) return res.status(400).json({ message: 'Invalid status' });

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    ticket.status = status;
    if (!ticket.assignedTo) ticket.assignedTo = req.user._id;
    ticket.lastMessageAt = new Date();
    await ticket.save();

    const populated = await SupportTicket.findById(ticket._id)
      .populate('user', 'username role isAdmin')
      .populate('assignedTo', 'username role isAdmin')
      .populate('messages.sender', 'username role isAdmin')
      .lean();

    res.json(formatTicket(populated));
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to update support ticket status' });
  }
});

module.exports = router;
