const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const User = require('./models/User');

dotenv.config();

const app = express();

// Middleware
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CORS_ORIGIN,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // Netlify domains
  /^https:\/\/.+\.netlify\.app$/,
  // Vercel domains  
  /^https:\/\/.+\.vercel\.app$/,
  // Render domains
  /^https:\/\/.+\.onrender\.com$/
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    // Check exact match
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Check regex patterns
    const matchesPattern = allowedOrigins.some(o => o instanceof RegExp && o.test(origin));
    if (matchesPattern) return callback(null, true);
    return callback(new Error('CORS blocked for this origin'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '6mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.status(200).json({
    service: 'gamehub-api',
    status: 'ok'
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
  family: 4 // Use IPv4
})
.then(async () => {
  console.log('MongoDB connected');
  await Promise.all([
    User.updateMany(
      { isAdmin: true, role: { $ne: 'admin' } },
      { $set: { role: 'admin' } }
    ),
    User.updateMany(
      { role: 'admin', isAdmin: { $ne: true } },
      { $set: { isAdmin: true } }
    )
  ]);
  const adminUsername = process.env.ADMIN_USERNAME?.trim();
  if (!adminUsername) return;
  const adminAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${adminUsername}`;
  const existingUser = await User.findOne({ username: adminUsername });
  if (existingUser) {
    const needsAdminSync = existingUser.role !== 'admin' || !existingUser.isAdmin;
    if (needsAdminSync) {
      existingUser.role = 'admin';
      existingUser.isAdmin = true;
      await existingUser.save();
    }
    return;
  }
  if (!process.env.ADMIN_PASSWORD) return;
  await User.create({
    username: adminUsername,
    password: process.env.ADMIN_PASSWORD,
    avatar: adminAvatar,
    role: 'admin',
    isAdmin: true
  });
})
.catch(err => {
  console.error('MongoDB connection error:', err);
  console.log('Hint: Please whitelist your IP (0.0.0.0/0) in MongoDB Atlas Network Access.');
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/games', require('./routes/games'));
app.use('/api/scores', require('./routes/scores'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/support', require('./routes/support'));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
