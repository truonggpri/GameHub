const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planId: { type: String, required: true },
  planTitle: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  days: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'], 
    default: 'pending' 
  },
  paymentMethod: { type: String, enum: ['mock', 'bank_transfer', 'credit_card', 'e_wallet', 'stripe'], default: 'mock' },
  stripeCustomerId: { type: String, default: null },
  stripeSessionId: { type: String, default: null },
  stripePaymentIntentId: { type: String, default: null },
  stripeInvoiceId: { type: String, default: null },
  transactionId: { type: String, unique: true, sparse: true },
  externalTransactionId: { type: String, default: null },
  paidAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  notifySent: { type: Boolean, default: false },
  adminNotified: { type: Boolean, default: false },
  notes: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

paymentSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

// Index for fast queries
paymentSchema.index({ userId: 1, status: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ transactionId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
