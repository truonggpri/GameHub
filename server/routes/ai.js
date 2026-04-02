const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Game = require('../models/Game');
const Score = require('../models/Score');
const User = require('../models/User');
const SupportTicket = require('../models/SupportTicket');

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

const resolveUserRole = (user) => {
  if (user?.isAdmin) return 'admin';
  if (user?.role === 'admin' || user?.role === 'mod' || user?.role === 'user') return user.role;
  return 'user';
};

const requireAuthUser = async (req) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ _id: decoded.id, deletedAt: null }).select('_id username role isAdmin');
    return user || null;
  } catch {
    return null;
  }
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

const normalizeSupportCategory = (value) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (['vip', 'game', 'billing', 'account', 'other'].includes(raw)) return raw;
  if (['payment', 'purchase', 'refund'].includes(raw)) return 'billing';
  if (['login', 'profile', 'security'].includes(raw)) return 'account';
  return 'other';
};

const deriveCategoryFromText = (text) => {
  const normalized = String(text || '').toLowerCase();
  if (/(vip|membership|premium)/.test(normalized)) return 'vip';
  if (/(payment|momo|bank|stripe|billing|refund|invoice)/.test(normalized)) return 'billing';
  if (/(account|login|password|avatar|profile|auth)/.test(normalized)) return 'account';
  if (/(game|match|score|lag|bug|error|crash|freeze)/.test(normalized)) return 'game';
  return 'other';
};

const buildIssueSummaryFallback = (message, gameTitle) => {
  const compact = String(message || '').replace(/\s+/g, ' ').trim();
  const short = compact.slice(0, 96);
  const subject = gameTitle
    ? `[${gameTitle}] ${short || 'Báo lỗi từ người dùng'}`
    : short || 'Báo lỗi từ người dùng';
  return {
    subject: subject.slice(0, 120),
    category: deriveCategoryFromText(compact),
    summary: compact || 'Người dùng chưa cung cấp đủ mô tả.',
    reproductionSteps: [],
    expectedBehavior: '',
    actualBehavior: compact || '',
    impact: '',
    environment: '',
    requestedHelp: ''
  };
};

const formatIssueForAdmin = (issue, meta = {}) => {
  const lines = [
    `AI Summary: ${issue.summary || 'N/A'}`,
    issue.actualBehavior ? `Actual: ${issue.actualBehavior}` : '',
    issue.expectedBehavior ? `Expected: ${issue.expectedBehavior}` : '',
    issue.impact ? `Impact: ${issue.impact}` : '',
    issue.environment ? `Environment: ${issue.environment}` : '',
    issue.requestedHelp ? `Requested support: ${issue.requestedHelp}` : '',
    Array.isArray(issue.reproductionSteps) && issue.reproductionSteps.length > 0
      ? `Reproduction steps:\n${issue.reproductionSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`
      : '',
    meta.gameTitle ? `Game: ${meta.gameTitle}` : '',
    meta.originalUserMessage ? `Original user message: ${meta.originalUserMessage}` : ''
  ].filter(Boolean);

  return lines.join('\n\n').slice(0, 1900);
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

router.post('/report-issue', async (req, res) => {
  try {
    const user = await requireAuthUser(req);
    if (!user) {
      return res.status(401).json({ message: 'Login is required to submit an issue report' });
    }

    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    const gameId = typeof req.body.gameId === 'string' ? req.body.gameId.trim() : '';
    const conversationRaw = Array.isArray(req.body.conversation) ? req.body.conversation : [];
    const conversation = conversationRaw
      .map((item) => ({
        role: item?.role === 'assistant' ? 'assistant' : 'user',
        content: typeof item?.content === 'string' ? item.content.trim() : ''
      }))
      .filter((item) => item.content)
      .slice(-10);

    if (!message || message.length < 6) {
      return res.status(400).json({ message: 'Issue description must be at least 6 characters' });
    }
    if (message.length > 2500) {
      return res.status(400).json({ message: 'Issue description is too long' });
    }

    let selectedGame = null;
    if (mongoose.Types.ObjectId.isValid(gameId)) {
      selectedGame = await Game.findById(gameId).select('title category difficulty');
    }

    let issue = buildIssueSummaryFallback(message, selectedGame?.title || '');

    try {
      const aiContent = await fetchAiCompletion([
        {
          role: 'system',
          content: 'Bạn là điều phối viên hỗ trợ GameHub. Hãy chuẩn hóa lỗi người dùng thành JSON object hợp lệ với schema {"subject":"","category":"vip|game|billing|account|other","summary":"","reproductionSteps":[""],"expectedBehavior":"","actualBehavior":"","impact":"","environment":"","requestedHelp":""}. Trả JSON duy nhất, không thêm text khác.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            reporter: { username: user.username, role: resolveUserRole(user) },
            selectedGame: selectedGame
              ? {
                  title: selectedGame.title,
                  category: selectedGame.category || '',
                  difficulty: selectedGame.difficulty || ''
                }
              : null,
            latestIssueMessage: message,
            recentConversation: conversation
          })
        }
      ]);

      const parsed = extractJsonObject(aiContent) || extractJsonObjectFromText(aiContent);
      if (parsed && typeof parsed === 'object') {
        issue = {
          subject: typeof parsed.subject === 'string' ? parsed.subject.trim().slice(0, 120) : issue.subject,
          category: normalizeSupportCategory(parsed.category),
          summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : issue.summary,
          reproductionSteps: Array.isArray(parsed.reproductionSteps)
            ? parsed.reproductionSteps.map((step) => String(step || '').trim()).filter(Boolean).slice(0, 8)
            : issue.reproductionSteps,
          expectedBehavior: typeof parsed.expectedBehavior === 'string' ? parsed.expectedBehavior.trim() : '',
          actualBehavior: typeof parsed.actualBehavior === 'string' ? parsed.actualBehavior.trim() : issue.actualBehavior,
          impact: typeof parsed.impact === 'string' ? parsed.impact.trim() : '',
          environment: typeof parsed.environment === 'string' ? parsed.environment.trim() : '',
          requestedHelp: typeof parsed.requestedHelp === 'string' ? parsed.requestedHelp.trim() : ''
        };
      }
    } catch {
      issue = {
        ...issue,
        category: normalizeSupportCategory(issue.category)
      };
    }

    if (!issue.subject) {
      issue.subject = buildIssueSummaryFallback(message, selectedGame?.title || '').subject;
    }

    const now = new Date();
    const ticket = await SupportTicket.create({
      user: user._id,
      subject: issue.subject,
      category: normalizeSupportCategory(issue.category || deriveCategoryFromText(message)),
      status: 'open',
      gameId,
      messages: [{
        sender: user._id,
        senderRole: resolveUserRole(user),
        content: formatIssueForAdmin(issue, {
          gameTitle: selectedGame?.title || '',
          originalUserMessage: message
        }),
        createdAt: now
      }],
      lastMessageAt: now
    });

    res.status(201).json({
      message: 'AI đã tổng hợp và gửi ticket cho admin.',
      ticket: {
        id: ticket._id,
        subject: ticket.subject,
        category: ticket.category,
        status: ticket.status
      },
      aiSummary: issue.summary || ''
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to submit AI issue report' });
  }
});

module.exports = router;
