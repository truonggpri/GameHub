const mongoose = require('mongoose');
const Game = require('./models/Game');
require('dotenv').config();

const seedExclusiveGames = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gamehub');
    console.log('Connected to MongoDB');

    const games = [
      {
        title: 'Pokemon Battle',
        description: 'Turn-based battle game with unique Pokemon and type system',
        path: '/pokemon',
        category: 'RPG',
        tags: ['Turn-based', 'Strategy', 'Single Player'],
        difficulty: 'Medium',
        publisher: 'GameHub Team',
        players: '1 Player',
        controls: 'Mouse & Keyboard',
        vipOnly: true,
        isCustom: true,
        playCount: 0,
        likeCount: 0,
        imageUrl: 'https://images.unsplash.com/photo-1542779283-4290f0445d3b?w=400&h=300&fit=crop'
      },
      {
        title: 'Snake Arena',
        description: 'Classic snake game with power-ups and arena modes',
        path: '/snake',
        category: 'Arcade',
        tags: ['Arcade', 'Multiplayer', 'Classic'],
        difficulty: 'Easy',
        publisher: 'GameHub Team',
        players: '1-2 Players',
        controls: 'Arrow Keys / WASD',
        vipOnly: true,
        isCustom: true,
        playCount: 0,
        likeCount: 0,
        imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&h=300&fit=crop'
      }
    ];

    for (const gameData of games) {
      const existing = await Game.findOne({ path: gameData.path });
      if (existing) {
        console.log(`Game ${gameData.title} already exists, skipping...`);
        continue;
      }

      const game = new Game(gameData);
      await game.save();
      console.log(`Created game: ${gameData.title}`);
    }

    console.log('Seed completed!');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
};

seedExclusiveGames();
