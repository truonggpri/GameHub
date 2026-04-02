const mongoose = require('mongoose');

const gameCommentSchema = new mongoose.Schema({
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  parentComment: { type: mongoose.Schema.Types.ObjectId, ref: 'GameComment', default: null, index: true },
  content: { type: String, required: true, trim: true, maxlength: 2000 },
  likes: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  isEdited: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

gameCommentSchema.pre('save', function() {
  this.updatedAt = new Date();
});

gameCommentSchema.index({ game: 1, createdAt: -1 });
gameCommentSchema.index({ user: 1, createdAt: -1 });
gameCommentSchema.index({ game: 1, parentComment: 1, createdAt: -1 });

module.exports = mongoose.model('GameComment', gameCommentSchema);
