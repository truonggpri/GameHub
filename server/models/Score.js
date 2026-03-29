const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  gameId: { type: String, required: true },
  score: { type: Number, required: true },
  activityType: { type: String, default: 'match_end' },
  result: { type: String, default: 'completed' },
  durationSeconds: { type: Number, default: 0 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Score', scoreSchema);
