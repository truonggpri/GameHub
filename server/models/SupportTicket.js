const mongoose = require('mongoose');

const supportMessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderRole: { type: String, enum: ['admin', 'mod', 'user'], required: true },
  content: { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const supportTicketSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subject: { type: String, required: true, trim: true, maxlength: 120 },
  category: {
    type: String,
    enum: ['vip', 'game', 'billing', 'account', 'other'],
    default: 'other',
    index: true
  },
  status: {
    type: String,
    enum: ['open', 'pending', 'resolved', 'closed'],
    default: 'open',
    index: true
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  gameId: { type: String, default: '' },
  messages: [supportMessageSchema],
  lastMessageAt: { type: Date, default: Date.now }
}, { timestamps: true });

supportTicketSchema.index({ status: 1, lastMessageAt: -1 });
supportTicketSchema.index({ user: 1, lastMessageAt: -1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
