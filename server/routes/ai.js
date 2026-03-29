const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Game = require('../models/Game');
const Score = require('../models/Score');
const User = require('../models/User');

const router = express.Router();

const AI_PROVIDER = (process.env.AI_PROVIDER || 'qwen').toLowerCase();
const DEFAULT_AI_BASE_URL = AI_PROVIDER === 'qwen'
  ? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
  : 'https://api.openai.com/v1';
const DEFAULT_AI_MODEL = AI_PROVIDER === 'qwen' ? 'qwen-plus' : 'gpt-4o-mini';
const AI_API_BASE_URL = (process.env.AI_API_BASE_URL || DEFAULT_AI_BASE_URL).replace(/\/$/, '');
const AI_MODEL = process.env.AI_MODEL || DEFAULT_AI_MODEL;
const AI_API_KEY = process.env.AI_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || '';

const normalizeTag = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
};

const resolveGameTags = (game = {}) => {
  const explicit = Array.isArray(game.tags) ? game.tags : [];
  const fallback = [game.category, game.difficulty];
  return Array.from(new Set([...explicit, ...fallback].map(normalizeTag).filter(Boolean))).slice(0, 12);
};

const toRecommendationItem = (game, reason = '') => ({
  id: game._id.toString(),
  title: game.title,
  description: game.description || '',
  imageUrl: game.imageUrl || '',
  category: game.category || '',
  difficulty: game.difficulty || '',
  rating: Number(game.rating) || 0,
  tags: resolveGameTags(game),
  url: game.url || '',
  reason: reason || ''
});

const toSlimGame = (game) => ({
  id: game._id.toString(),
  title: game.title || '',
  category: game.category || '',
  difficulty: game.difficulty || '',
  tags: resolveGameTags(game),
  rating: Number(game.rating) || 0
});

const getAuthorizedUserId = (req) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?.id || null;
  } catch {
    return null;
  }
};

const extractJsonObject = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const extractJsonObjectFromText = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      return null;
    }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
};

const getUserAiProfile = async (userId) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return null;
  const user = await User.findById(userId).select('username role favorites createdAt');
  if (!user) return null;

  const scores = await Score.find({ user: userId })
    .sort({ date: -1 })
    .limit(120)
    .select('gameId score result durationSeconds date');

  const recentGameIds = Array.from(
    new Set(scores.map((item) => String(item.gameId || '')).filter(Boolean))
  ).slice(0, 12);
  const favoriteGameIds = Array.isArray(user.favorites)
    ? Array.from(new Set(user.favorites.map((item) => String(item || '')).filter(Boolean)))
    : [];

  const allSignalIds = Array.from(new Set([...favoriteGameIds, ...recentGameIds]));
  const objectIds = allSignalIds
    .filter((item) => mongoose.Types.ObjectId.isValid(item))
    .map((item) => new mongoose.Types.ObjectId(item));

  let signalGames = [];
  if (objectIds.length > 0) {
    signalGames = await Game.find({ _id: { $in: objectIds }, url: { $exists: true, $ne: '' } })
      .select('title category difficulty tags rating');
  }
  const gameById = new Map(signalGames.map((item) => [item._id.toString(), item]));

  const playCounts = new Map();
  for (const row of scores) {
    const id = String(row.gameId || '');
    if (!id) continue;
    playCounts.set(id, (playCounts.get(id) || 0) + 1);
  }

  const categoryWeights = new Map();
  const tagWeights = new Map();
  for (const gameId of allSignalIds) {
    const game = gameById.get(gameId);
    if (!game) continue;
    const base = (playCounts.get(gameId) || 0) + (favoriteGameIds.includes(gameId) ? 2 : 0);
    const category = normalizeTag(game.category);
    if (category) categoryWeights.set(category, (categoryWeights.get(category) || 0) + base);
    const tags = resolveGameTags(game);
    for (const tag of tags) {
      tagWeights.set(tag, (tagWeights.get(tag) || 0) + base);
    }
  }

  const preferredCategories = Array.from(categoryWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value]) => value);
  const preferredTags = Array.from(tagWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value]) => value);

  return {
    username: user.username || '',
    role: user.role || 'user',
    memberSince: user.createdAt || null,
    totalMatches: scores.length,
    favoriteGameIds,
    recentGameIds,
    preferredCategories,
    preferredTags,
    favoriteGames: favoriteGameIds.map((id) => gameById.get(id)).filter(Boolean).slice(0, 8).map(toSlimGame),
    recentGames: recentGameIds.map((id) => gameById.get(id)).filter(Boolean).slice(0, 8).map(toSlimGame)
  };
};

const buildFallbackRecommendations = (currentGame, candidates = [], recentIds = [], limit = 6, userProfile = null) => {
  const currentTags = new Set(resolveGameTags(currentGame));
  const recentSet = new Set(recentIds.map(String));
  const favoriteSet = new Set((userProfile?.favoriteGameIds || []).map(String));
  const preferredCategorySet = new Set((userProfile?.preferredCategories || []).map((item) => normalizeTag(item)));
  const preferredTagSet = new Set((userProfile?.preferredTags || []).map((item) => normalizeTag(item)));
  const scored = candidates.map((candidate) => {
    const tags = resolveGameTags(candidate);
    const overlap = tags.reduce((count, tag) => count + (currentTags.has(tag) ? 1 : 0), 0);
    const sameCategory = currentGame.category && candidate.category === currentGame.category ? 2 : 0;
    const sameDifficulty = currentGame.difficulty && candidate.difficulty === currentGame.difficulty ? 1 : 0;
    const ratingBoost = Math.min(2, (Number(candidate.rating) || 0) / 3);
    const recentBoost = recentSet.has(String(candidate._id)) ? 0.7 : 0;
    const favoriteBoost = favoriteSet.has(String(candidate._id)) ? 3 : 0;
    const preferredCategoryBoost = preferredCategorySet.has(normalizeTag(candidate.category)) ? 1.2 : 0;
    const preferredTagBoost = tags.reduce((count, tag) => count + (preferredTagSet.has(tag) ? 0.4 : 0), 0);
    const score = overlap * 2 + sameCategory + sameDifficulty + ratingBoost + recentBoost + favoriteBoost + preferredCategoryBoost + preferredTagBoost;
    return { candidate, score, overlap, sameCategory, sameDifficulty, favoriteBoost, preferredCategoryBoost, preferredTagBoost };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => {
      const reasons = [];
      if (item.sameCategory) reasons.push(`cùng thể loại ${item.candidate.category}`);
      if (item.sameDifficulty) reasons.push(`độ khó ${item.candidate.difficulty}`);
      if (item.overlap > 0) reasons.push(`nhiều tag tương đồng`);
      if (item.favoriteBoost > 0) reasons.push('nằm trong game yêu thích');
      if (item.preferredCategoryBoost > 0) reasons.push('đúng gu thể loại thường chơi');
      if (item.preferredTagBoost > 0) reasons.push('hợp tag bạn hay chơi');
      if (reasons.length === 0) reasons.push('phù hợp với lịch sử chơi gần đây');
      return toRecommendationItem(item.candidate, reasons.join(', '));
    });
};

const fetchAiCompletion = async (messages) => {
  if (!AI_API_KEY) throw new Error('Missing AI_API_KEY');
  const response = await fetch(`${AI_API_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_API_KEY}`
    },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.4,
      messages
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || '';
};

router.post('/recommendations', async (req, res) => {
  try {
    const gameId = typeof req.body.gameId === 'string' ? req.body.gameId.trim() : '';
    const limitRaw = Number(req.body.limit);
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 10) : 6;
    if (!mongoose.Types.ObjectId.isValid(gameId)) {
      return res.status(400).json({ message: 'gameId is invalid' });
    }

    const currentGame = await Game.findOne({ _id: gameId, url: { $exists: true, $ne: '' } });
    if (!currentGame) return res.status(404).json({ message: 'Game not found' });

    const candidates = await Game.find({
      _id: { $ne: gameId },
      url: { $exists: true, $ne: '' }
    })
      .sort({ rating: -1, createdAt: -1 })
      .limit(120);

    if (candidates.length === 0) {
      return res.json({ items: [], source: 'fallback' });
    }

    const userId = getAuthorizedUserId(req);
    let recentGameIds = [];
    let userProfile = null;
    if (userId) {
      userProfile = await getUserAiProfile(userId);
      recentGameIds = Array.isArray(userProfile?.recentGameIds) ? userProfile.recentGameIds.slice(0, 8) : [];
    }

    const candidateSlim = candidates.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      category: item.category || '',
      difficulty: item.difficulty || '',
      tags: resolveGameTags(item),
      rating: Number(item.rating) || 0
    }));

    try {
      const aiContent = await fetchAiCompletion([
        {
          role: 'system',
          content: 'Bạn là công cụ gợi ý game. Chỉ trả JSON object hợp lệ theo dạng {"items":[{"id":"<gameId>","reason":"<lý do ngắn>"}]}. Chỉ dùng id trong danh sách candidate.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            currentGame: {
              id: currentGame._id.toString(),
              title: currentGame.title,
              category: currentGame.category || '',
              difficulty: currentGame.difficulty || '',
              tags: resolveGameTags(currentGame),
              rating: Number(currentGame.rating) || 0
            },
            userProfile: userProfile
              ? {
                  username: userProfile.username,
                  totalMatches: userProfile.totalMatches,
                  favoriteGameIds: userProfile.favoriteGameIds,
                  preferredCategories: userProfile.preferredCategories,
                  preferredTags: userProfile.preferredTags,
                  favoriteGames: userProfile.favoriteGames,
                  recentGames: userProfile.recentGames
                }
              : null,
            recentGameIds,
            limit,
            candidates: candidateSlim
          })
        }
      ]);
      const parsed = extractJsonObject(aiContent) || extractJsonObjectFromText(aiContent);
      const itemsRaw = Array.isArray(parsed?.items) ? parsed.items : [];
      const byId = new Map(candidates.map((item) => [item._id.toString(), item]));
      const items = itemsRaw
        .map((item) => {
          const id = typeof item?.id === 'string' ? item.id : '';
          if (!byId.has(id)) return null;
          const reason = typeof item?.reason === 'string' ? item.reason : '';
          return toRecommendationItem(byId.get(id), reason);
        })
        .filter(Boolean)
        .slice(0, limit);

      if (items.length > 0) {
        return res.json({ items, source: 'ai' });
      }
    } catch {
      const fallbackItems = buildFallbackRecommendations(currentGame, candidates, recentGameIds, limit, userProfile);
      return res.json({ items: fallbackItems, source: 'fallback' });
    }

    const fallbackItems = buildFallbackRecommendations(currentGame, candidates, recentGameIds, limit, userProfile);
    res.json({ items: fallbackItems, source: 'fallback' });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to generate recommendations' });
  }
});

router.post('/chat', async (req, res) => {
  try {
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    const gameId = typeof req.body.gameId === 'string' ? req.body.gameId.trim() : '';
    if (!message) return res.status(400).json({ message: 'message is required' });
    if (message.length > 1200) return res.status(400).json({ message: 'message is too long' });

    let selectedGame = null;
    if (mongoose.Types.ObjectId.isValid(gameId)) {
      selectedGame = await Game.findById(gameId).select('title category difficulty tags description');
    }
    const topGames = await Game.find({ url: { $exists: true, $ne: '' } })
      .sort({ rating: -1, createdAt: -1 })
      .limit(20)
      .select('title category difficulty tags rating');
    const userId = getAuthorizedUserId(req);
    const userProfile = userId ? await getUserAiProfile(userId) : null;

    const fallback = () => {
      const normalizedMessage = message.toLowerCase();
      const preferredCategorySet = new Set((userProfile?.preferredCategories || []).map((item) => normalizeTag(item)));
      const preferredTagSet = new Set((userProfile?.preferredTags || []).map((item) => normalizeTag(item)));
      const personalized = topGames
        .map((item) => {
          const tags = resolveGameTags(item);
          const category = normalizeTag(item.category);
          const score = tags.reduce((sum, tag) => sum + (preferredTagSet.has(tag) ? 1 : 0), 0) + (preferredCategorySet.has(category) ? 2 : 0);
          return { item, score };
        })
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.item);
      const candidatePool = userProfile ? personalized : topGames;
      const matched = candidatePool
        .filter((item) => {
          const tags = resolveGameTags(item);
          const base = `${item.title} ${item.category || ''} ${item.difficulty || ''} ${tags.join(' ')}`.toLowerCase();
          return normalizedMessage.split(/\s+/).some((token) => token.length > 2 && base.includes(token));
        })
        .slice(0, 3);

      if (matched.length === 0) {
        const picks = candidatePool.slice(0, 3).map((item) => `- ${item.title} (${item.category || 'Custom'})`).join('\n');
        if (userProfile) {
          return `Mình đang ưu tiên theo hồ sơ chơi của bạn (favorites + lịch sử gần đây). Bạn có thể thử:\n${picks}\nBạn muốn mình lọc sâu hơn theo độ khó hoặc phong cách chơi không?`;
        }
        return `Mình gợi ý bạn thử các game đang được đánh giá tốt:\n${picks}\nBạn có thể nói rõ bạn thích thể loại hoặc độ khó nào để mình gợi ý sát hơn.`;
      }

      const picks = matched.map((item) => `- ${item.title} (${item.category || 'Custom'} • ${item.difficulty || 'Medium'})`).join('\n');
      return `Theo sở thích bạn vừa mô tả, bạn có thể chơi thử:\n${picks}\nNếu muốn mình sẽ lọc thêm theo nhịp chơi nhanh/chậm hoặc solo/multiplayer.`;
    };

    try {
      const aiContent = await fetchAiCompletion([
        {
          role: 'system',
          content: 'Bạn là trợ lý GameHub. Trả lời ngắn gọn, thực tế, ưu tiên gợi ý game phù hợp, ngôn ngữ tiếng Việt thân thiện.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            userMessage: message,
            userProfile: userProfile
              ? {
                  username: userProfile.username,
                  totalMatches: userProfile.totalMatches,
                  preferredCategories: userProfile.preferredCategories,
                  preferredTags: userProfile.preferredTags,
                  favoriteGames: userProfile.favoriteGames,
                  recentGames: userProfile.recentGames
                }
              : null,
            selectedGame: selectedGame
              ? {
                  title: selectedGame.title,
                  category: selectedGame.category || '',
                  difficulty: selectedGame.difficulty || '',
                  tags: resolveGameTags(selectedGame)
                }
              : null,
            topGames: topGames.map((item) => ({
              title: item.title,
              category: item.category || '',
              difficulty: item.difficulty || '',
              tags: resolveGameTags(item),
              rating: Number(item.rating) || 0
            }))
          })
        }
      ]);

      const answer = typeof aiContent === 'string' ? aiContent.trim() : '';
      if (answer) {
        return res.json({ message: answer, source: 'ai' });
      }
    } catch {
      return res.json({ message: fallback(), source: 'fallback' });
    }

    res.json({ message: fallback(), source: 'fallback' });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to process chat message' });
  }
});

module.exports = router;
