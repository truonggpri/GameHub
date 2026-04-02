const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  imageUrl: { type: String },
  url: { type: String }, // For embedded games
  path: { type: String }, // For internal games
  category: { type: String, default: 'Arcade' },
  tags: {
    type: [String],
    default: []
  },
  rating: { type: Number, default: 0 },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard', 'Expert'], default: 'Medium' },
  publisher: { type: String, default: '' },
  version: { type: String, default: '' },
  players: { type: String, default: '' },
  controls: { type: String, default: '' },
  playCount: { type: Number, default: 0 },
  likeCount: { type: Number, default: 0 },
  vipOnly: { type: Boolean, default: false },
  isCustom: { type: Boolean, default: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  color: { type: String, default: 'group-hover:shadow-[0_0_30px_rgba(255,165,0,0.5)]' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Game', gameSchema);
