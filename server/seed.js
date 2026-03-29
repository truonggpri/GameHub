const mongoose = require('mongoose');
const Game = require('./models/Game');
const dotenv = require('dotenv');

dotenv.config();

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('MongoDB connected for seeding'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

const seedDB = async () => {
  const result = await Game.deleteMany({
    $or: [
      { isCustom: false },
      { url: { $exists: false } },
      { url: '' }
    ]
  });
  console.log(`Removed ${result.deletedCount} non-embedded/sample games`);
  process.exit();
};

seedDB();
