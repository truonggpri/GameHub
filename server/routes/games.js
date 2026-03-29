const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Game = require('../models/Game');
const Review = require('../models/Review');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const normalizeUrl = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
};

const activeGameQuery = {
  deletedAt: null,
  url: { $exists: true, $ne: '' }
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
  payload.category,
  payload.difficulty
]);

const resolveGameTags = (payload = {}) => {
  const explicitTags = normalizeTags(payload.tags);
  if (explicitTags.length > 0) return explicitTags;
  return deriveFallbackTags(payload);
};

const resolveRole = (user) => {
  if (user?.isAdmin) return 'admin';
  if (user?.role === 'admin' || user?.role === 'mod' || user?.role === 'user') {
    return user.role;
  }
  return 'user';
};

const isUserVip = (user) => {
  if (!user || user.vipTier !== 'vip' || !user.vipExpiresAt) return false;
  const expiresAt = new Date(user.vipExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
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

const toGameResponse = (game, options = {}) => {
  const base = typeof game?.toObject === 'function' ? game.toObject() : { ...game };
  const viewer = options.viewer || null;
  const vipOnly = Boolean(base.vipOnly);
  const canAccessVip = !vipOnly || isUserVip(viewer);
  return {
    ...base,
    tags: resolveGameTags(base),
    vipOnly,
    vipLocked: vipOnly && !canAccessVip,
    url: canAccessVip ? base.url : '',
    embedUrl: canAccessVip ? (base.embedUrl || '') : ''
  };
};

const toReviewResponse = (review) => ({
  id: review._id,
  rating: review.rating,
  comment: review.comment,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
  user: review.user
    ? {
        id: review.user._id,
        username: review.user.username,
        avatar: review.user.avatar,
        isVip: isUserVip(review.user)
      }
    : null
});

const toUserReviewResponse = (review) => {
  const game = review?.game || {};
  return {
    id: review._id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    game: {
      id: game._id,
      title: game.title || 'Unknown game',
      image: game.imageUrl || game.image || '',
      category: game.category || '',
      difficulty: game.difficulty || ''
    }
  };
};

const getReviewSummary = async (gameId) => {
  const objectId = new mongoose.Types.ObjectId(gameId);
  const grouped = await Review.aggregate([
    { $match: { game: objectId } },
    { $group: { _id: '$rating', count: { $sum: 1 } } }
  ]);

  const counts = new Map(grouped.map((item) => [item._id, item.count]));
  const breakdown = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: counts.get(stars) || 0
  }));

  const totalRatings = breakdown.reduce((sum, item) => sum + item.count, 0);
  const weightedTotal = breakdown.reduce((sum, item) => sum + item.stars * item.count, 0);
  const averageRating = totalRatings > 0 ? Number((weightedTotal / totalRatings).toFixed(1)) : 0;

  return {
    averageRating,
    totalRatings,
    breakdown
  };
};

const syncGameAverageRating = async (gameId) => {
  const reviewSummary = await getReviewSummary(gameId);
  await Game.findByIdAndUpdate(gameId, { rating: reviewSummary.averageRating });
  return reviewSummary;
};

const getAuthorizedUser = async (req) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.id) return null;
    const user = await User.findOne({ _id: decoded.id, deletedAt: null })
      .select('_id role isAdmin vipTier vipExpiresAt deletedAt')
      .lean();
    if (!user || user.deletedAt) return null;
    return user;
  } catch {
    return null;
  }
};

const REVIEW_SORTS = {
  newest: { updatedAt: -1, createdAt: -1 },
  oldest: { updatedAt: 1, createdAt: 1 },
  highest: { rating: -1, updatedAt: -1, createdAt: -1 },
  lowest: { rating: 1, updatedAt: -1, createdAt: -1 }
};

const normalizeReviewSort = (value) => (
  typeof value === 'string' && REVIEW_SORTS[value] ? value : 'newest'
);

const getReviewList = async (gameId, options = {}) => {
  const limitRaw = Number(options.limit);
  const pageRaw = Number(options.page);
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
  const requestedPage = Number.isInteger(pageRaw) ? Math.max(pageRaw, 1) : 1;
  const sort = normalizeReviewSort(options.sort);

  const total = await Review.countDocuments({ game: gameId });
  const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
  const page = Math.min(requestedPage, totalPages);
  const skip = (page - 1) * limit;

  const reviews = await Review.find({ game: gameId })
    .sort(REVIEW_SORTS[sort])
    .skip(skip)
    .limit(limit)
    .populate('user', 'username avatar vipTier vipExpiresAt');

  return {
    comments: reviews.map(toReviewResponse),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    },
    sort
  };
};

// Middleware to check auth (optional for GET, required for POST)
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    res.status(400).json({ message: 'Token is not valid' });
  }
};

const requireModOrAdmin = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('_id role isAdmin deletedAt');
    const role = resolveRole(user);
    if (!user || user.deletedAt || !['admin', 'mod'].includes(role)) {
      return res.status(403).json({ message: 'Admin or Mod access required' });
    }
    req.user = { id: user._id.toString(), role, isAdmin: role === 'admin' };
    next();
  } catch (e) {
    res.status(400).json({ message: 'Token is not valid' });
  }
};

// Get all games
router.get('/', async (req, res) => {
  try {
    const viewer = await getAuthorizedUser(req);
    const games = await Game.find(activeGameQuery).sort({ createdAt: -1 });
    res.json(games.map((game) => toGameResponse(game, { viewer })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/reviews/me', auth, async (req, res) => {
  try {
    const sort = normalizeReviewSort(req.query.sort);
    const ratingRaw = Number(req.query.rating);
    const ratingFilter = Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const query = { user: req.user.id };
    if (ratingFilter) query.rating = ratingFilter;

    const reviews = await Review.find(query)
      .sort(REVIEW_SORTS[sort])
      .limit(200)
      .populate('game', 'title image imageUrl category difficulty');

    const searchValue = search.toLowerCase();
    const filtered = searchValue
      ? reviews.filter((item) => {
          const gameTitle = typeof item?.game?.title === 'string' ? item.game.title.toLowerCase() : '';
          const comment = typeof item?.comment === 'string' ? item.comment.toLowerCase() : '';
          return gameTitle.includes(searchValue) || comment.includes(searchValue);
        })
      : reviews;

    const starBuckets = [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: filtered.filter((item) => item.rating === stars).length
    }));
    const totalReviews = filtered.length;
    const averageRating = totalReviews > 0
      ? Number((filtered.reduce((sum, item) => sum + item.rating, 0) / totalReviews).toFixed(1))
      : 0;

    res.json({
      reviews: filtered.map(toUserReviewResponse),
      summary: {
        totalReviews,
        averageRating,
        breakdown: starBuckets
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get game detail with ratings and comments
router.get('/:id', async (req, res) => {
  try {
    const viewer = await getAuthorizedUser(req);
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid game id' });
    }

    const game = await Game.findOne({ _id: req.params.id, ...activeGameQuery });
    if (!game) return res.status(404).json({ message: 'Game not found' });

    const initialLimit = Math.min(Number(req.query.reviewLimit) || 10, 50);
    const initialSort = normalizeReviewSort(req.query.reviewSort);
    const [reviewSummary, reviewList] = await Promise.all([
      getReviewSummary(game._id),
      getReviewList(game._id, { limit: initialLimit, page: 1, sort: initialSort })
    ]);

    const userId = viewer?._id;
    let myReview = null;
    if (userId) {
      const mine = await Review.findOne({ game: game._id, user: userId });
      if (mine) {
        myReview = {
          id: mine._id,
          rating: mine.rating,
          comment: mine.comment,
          createdAt: mine.createdAt,
          updatedAt: mine.updatedAt
        };
      }
    }

    res.json({
      ...toGameResponse(game, { viewer }),
      reviewSummary,
      comments: reviewList.comments,
      commentsPagination: reviewList.pagination,
      commentsSort: reviewList.sort,
      myReview
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get reviews only
router.get('/:id/reviews', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid game id' });
    }

    const game = await Game.findOne({ _id: req.params.id, ...activeGameQuery }).select('_id');
    if (!game) return res.status(404).json({ message: 'Game not found' });

    const [reviewSummary, reviewList] = await Promise.all([
      getReviewSummary(game._id),
      getReviewList(game._id, {
        limit: req.query.limit,
        page: req.query.page,
        sort: req.query.sort
      })
    ]);

    res.json({ reviewSummary, ...reviewList });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create or update review for current user
router.post('/:id/reviews', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid game id' });
    }

    const game = await Game.findOne({ _id: req.params.id, ...activeGameQuery }).select('_id');
    if (!game) return res.status(404).json({ message: 'Game not found' });

    const rating = Number(req.body.rating);
    const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be an integer from 1 to 5' });
    }
    if (!comment) {
      return res.status(400).json({ message: 'Comment is required' });
    }
    if (comment.length > 1000) {
      return res.status(400).json({ message: 'Comment is too long (max 1000 characters)' });
    }

    let review = await Review.findOne({ game: game._id, user: req.user.id });
    const isUpdate = Boolean(review);

    if (isUpdate) {
      review.rating = rating;
      review.comment = comment;
      review.updatedAt = new Date();
      await review.save();
    } else {
      review = await Review.create({
        game: game._id,
        user: req.user.id,
        rating,
        comment
      });
    }

    await review.populate('user', 'username avatar vipTier vipExpiresAt');
    const reviewSummary = await syncGameAverageRating(game._id);

    res.status(isUpdate ? 200 : 201).json({
      message: isUpdate ? 'Review updated' : 'Review created',
      review: toReviewResponse(review),
      reviewSummary
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'You already reviewed this game. Please update your review.' });
    }
    res.status(500).json({ message: err.message });
  }
});

// Delete current user's review for a game
router.delete('/:id/reviews/me', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid game id' });
    }

    const game = await Game.findOne({ _id: req.params.id, ...activeGameQuery }).select('_id');
    if (!game) return res.status(404).json({ message: 'Game not found' });

    const review = await Review.findOne({ game: game._id, user: req.user.id });
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    await review.deleteOne();
    const reviewSummary = await syncGameAverageRating(game._id);

    res.json({
      message: 'Review deleted',
      reviewSummary
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a game
router.post('/', requireModOrAdmin, async (req, res) => {
  if (!req.body.title) {
    return res.status(400).json({ message: 'Title is required' });
  }

  const normalizedUrl = normalizeUrl(req.body.url);
  if (!normalizedUrl) {
    return res.status(400).json({ message: 'Game URL is required' });
  }
  if (!isValidHttpUrl(normalizedUrl)) {
    return res.status(400).json({ message: 'Only HTTP/HTTPS game URLs are supported' });
  }

  const game = new Game({
    ...req.body,
    tags: resolveGameTags(req.body),
    vipOnly: parseBooleanValue(req.body.vipOnly, false),
    url: normalizedUrl,
    path: undefined,
    isCustom: true,
    addedBy: req.user.id
  });

  try {
    const newGame = await game.save();
    res.status(201).json(newGame);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a game
router.delete('/:id', requireModOrAdmin, async (req, res) => {
  try {
    const game = await Game.findById(req.params.id);
    if (!game) return res.status(404).json({ message: 'Game not found' });
    if (game.deletedAt) return res.status(400).json({ message: 'Game is already deleted' });

    game.deletedAt = new Date();
    game.deletedBy = req.user.id;
    await game.save();

    res.json({ message: 'Game moved to trash' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
