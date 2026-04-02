const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Game = require('../models/Game');
const Score = require('../models/Score');
const User = require('../models/User');

dotenv.config();

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

const toStringId = (value) => {
  if (typeof value === 'string') return value;
  if (value && typeof value.toString === 'function') return value.toString();
  return '';
};

const syncGameCounters = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    family: 4
  });

  const games = await Game.find({}, { _id: 1 }).lean();
  const gameIds = games.map((game) => toStringId(game._id)).filter(Boolean);
  const gameIdSet = new Set(gameIds);

  const scoreDocs = await Score.find({}, { gameId: 1, activityType: 1 }).lean();
  const playCounts = new Map();

  for (const item of scoreDocs) {
    const gameId = toStringId(item.gameId);
    if (!gameIdSet.has(gameId)) continue;

    const activityType = normalizeActivityType(item.activityType);
    if (!PLAY_COUNT_ACTIVITY_TYPES.has(activityType)) continue;

    playCounts.set(gameId, (playCounts.get(gameId) || 0) + 1);
  }

  const favoriteAgg = await User.aggregate([
    {
      $project: {
        favorites: { $ifNull: ['$favorites', []] }
      }
    },
    {
      $unwind: '$favorites'
    },
    {
      $match: {
        favorites: { $in: gameIds }
      }
    },
    {
      $group: {
        _id: '$favorites',
        users: { $addToSet: '$_id' }
      }
    },
    {
      $project: {
        count: { $size: '$users' }
      }
    }
  ]);

  const likeCounts = new Map(
    favoriteAgg.map((item) => [toStringId(item._id), Number(item.count) || 0])
  );

  const bulkOps = games.map((game) => {
    const id = toStringId(game._id);
    return {
      updateOne: {
        filter: { _id: game._id },
        update: {
          $set: {
            playCount: playCounts.get(id) || 0,
            likeCount: likeCounts.get(id) || 0
          }
        }
      }
    };
  });

  if (bulkOps.length > 0) {
    await Game.bulkWrite(bulkOps, { ordered: false });
  }

  const totalPlays = Array.from(playCounts.values()).reduce((sum, value) => sum + value, 0);
  const totalLikes = Array.from(likeCounts.values()).reduce((sum, value) => sum + value, 0);

  console.log(`[sync-game-counters] Updated ${games.length} games`);
  console.log(`[sync-game-counters] Total plays synced: ${totalPlays}`);
  console.log(`[sync-game-counters] Total likes synced: ${totalLikes}`);
};

syncGameCounters()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[sync-game-counters] Failed:', error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
