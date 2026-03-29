const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true, trim: true, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

reviewSchema.pre('save', function() {
  this.updatedAt = new Date();
});

reviewSchema.index({ game: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
