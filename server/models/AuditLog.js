const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorRole: { type: String, enum: ['admin', 'mod', 'user'], required: true },
  action: { type: String, required: true, trim: true },
  targetType: { type: String, enum: ['user', 'game', 'system'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
  targetLabel: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
