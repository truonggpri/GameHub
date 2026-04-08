const express = require('express');
const router = express.Router();
const Score = require('../models/Score');
const Game = require('../models/Game');
const jwt = require('jsonwebtoken');

const resolveAuthUserId = (decoded) => {
  if (!decoded || typeof decoded !== 'object') return '';
  const directId = typeof decoded.id === 'string' ? decoded.id.trim() : '';
  if (directId) return directId;
  const nestedId = typeof decoded.user?.id === 'string' ? decoded.user.id.trim() : '';
  if (nestedId) return nestedId;
  const legacyId = typeof decoded._id === 'string' ? decoded._id.trim() : '';
  return legacyId;
};

const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = resolveAuthUserId(decoded);
    if (!userId) {
      return res.status(401).json({ message: 'Token invalid' });
    }
    req.user = { id: userId };
    next();
  } catch (e) {
    res.status(400).json({ message: 'Token invalid' });
  }
};

const TERMINAL_ACTIVITY_TYPES = new Set([
  'match_end',
  'game_result',
  'session_end',
  'completed'
]);

const PLAY_COUNT_ACTIVITY_TYPES = new Set([
  'match_end',
  'game_result',
  'session_end',
  'completed'
]);

const normalizeActivityType = (value) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!raw) return 'match_end';
  if (raw === 'result' || raw === 'game_end') return 'game_result';
  if (raw === 'end' || raw === 'finish') return 'match_end';
  return raw;
};

const normalizeResult = (value) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!raw) return 'completed';
  if (raw === 'win' || raw === 'won' || raw === 'victory' || raw === 'x' || raw === 'o') return 'win';
  if (raw === 'lose' || raw === 'loss' || raw === 'lost' || raw === 'defeat' || raw === 'failed') return 'lose';
  if (raw === 'draw' || raw === 'tie') return 'draw';
  if (raw === 'completed') return 'completed';
  return raw;
};

const isMatchRecord = (item) => {
  const result = normalizeResult(item?.result);
  const activityType = normalizeActivityType(item?.activityType);
  if (result === 'win' || result === 'lose' || result === 'draw') return true;
  return TERMINAL_ACTIVITY_TYPES.has(activityType);
};

const isSessionEndRecord = (item) => {
  const activityType = normalizeActivityType(item?.activityType);
  return PLAY_COUNT_ACTIVITY_TYPES.has(activityType);
};

const toDayKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

const calculateStreaks = (scores) => {
  const uniqueDayKeys = Array.from(new Set(
    scores
      .map((item) => toDayKey(item?.date))
      .filter((item) => Number.isFinite(item))
  )).sort((a, b) => a - b);

  if (uniqueDayKeys.length === 0) {
    return { currentStreakDays: 0, longestStreakDays: 0 };
  }

  let longest = 1;
  let running = 1;
  for (let i = 1; i < uniqueDayKeys.length; i += 1) {
    const isConsecutive = uniqueDayKeys[i] - uniqueDayKeys[i - 1] === 86400000;
    running = isConsecutive ? running + 1 : 1;
    if (running > longest) longest = running;
  }

  const todayKey = toDayKey(new Date());
  const latestKey = uniqueDayKeys[uniqueDayKeys.length - 1];
  const canContinue = todayKey - latestKey <= 86400000;

  let current = 0;
  if (canContinue) {
    current = 1;
    for (let i = uniqueDayKeys.length - 2; i >= 0; i -= 1) {
      if (uniqueDayKeys[i + 1] - uniqueDayKeys[i] !== 86400000) break;
      current += 1;
    }
  }

  return {
    currentStreakDays: current,
    longestStreakDays: longest
  };
};

// Submit score
router.post('/', auth, async (req, res) => {
  try {
    const { gameId, score, activityType, result, durationSeconds, metadata } = req.body;
    if (!gameId || typeof score !== 'number') {
      return res.status(400).json({ message: 'gameId and score are required' });
    }
    const normalizedScore = Number(score);
    if (!Number.isFinite(normalizedScore)) {
      return res.status(400).json({ message: 'score must be a valid number' });
    }

    const newScore = new Score({
      user: req.user.id,
      gameId,
      score: normalizedScore,
      activityType: normalizeActivityType(activityType),
      result: normalizeResult(result),
      durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds) : 0,
      metadata: metadata && typeof metadata === 'object' ? metadata : {}
    });
    await newScore.save();

    if (isSessionEndRecord(newScore)) {
      await Game.updateOne(
        { _id: gameId },
        { $inc: { playCount: 1 } }
      );
    }

    res.status(201).json(newScore);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get user history
router.get('/user/history', auth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const scores = await Score.find({ user: req.user.id }).sort({ date: -1 }).limit(limit);
    res.json(scores);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/user/summary', auth, async (req, res) => {
  try {
    const scores = await Score.find({ user: req.user.id }).sort({ date: -1 });
    const matchScores = scores.filter(isMatchRecord);
    const totalMatches = matchScores.length;
    const totalScore = matchScores.reduce((sum, item) => sum + (item.score || 0), 0);
    const bestScore = totalMatches > 0 ? Math.max(...matchScores.map(item => item.score || 0)) : 0;
    const averageScore = totalMatches > 0 ? Number((totalScore / totalMatches).toFixed(2)) : 0;
    const totalPlayTimeSeconds = matchScores.reduce((sum, item) => sum + (item.durationSeconds || 0), 0);
    const gameMap = new Map();
    for (const item of matchScores) {
      const current = gameMap.get(item.gameId) || { gameId: item.gameId, plays: 0, totalScore: 0, bestScore: 0 };
      current.plays += 1;
      current.totalScore += item.score || 0;
      current.bestScore = Math.max(current.bestScore, item.score || 0);
      gameMap.set(item.gameId, current);
    }
    const topGames = Array.from(gameMap.values())
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 5)
      .map(item => ({
        ...item,
        averageScore: Number((item.totalScore / item.plays).toFixed(2))
      }));
    const recentMatches = matchScores.slice(0, 10);
    const recentAverageScore = recentMatches.length > 0
      ? Number((recentMatches.reduce((sum, item) => sum + (item.score || 0), 0) / recentMatches.length).toFixed(2))
      : 0;
    const { currentStreakDays, longestStreakDays } = calculateStreaks(matchScores);
    const lastActivityAt = scores.length > 0 ? scores[0].date : null;
    res.json({
      totalMatches,
      totalScore,
      bestScore,
      averageScore,
      recentAverageScore,
      recentMatchesCount: recentMatches.length,
      totalPlayTimeSeconds,
      gamesPlayed: gameMap.size,
      topGames,
      currentStreakDays,
      longestStreakDays,
      lastActivityAt
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get leaderboard for a game
router.get('/leaderboard/:gameId', async (req, res) => {
  try {
    const scores = await Score.find({ gameId: req.params.gameId })
      .sort({ score: -1 })
      .limit(10)
      .populate('user', 'username avatar');
    res.json(scores);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
