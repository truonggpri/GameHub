# GameHub

A web-based game collection platform where users can discover, play, and manage games. Built with React + Vite frontend and Express + MongoDB backend.

## Features

- User authentication (email/password and Google OAuth)
- First-time Google login email verification with OTP
- Game catalog with search and filter
- Admin panel for game management
- Multi-language support (i18n)
- Responsive design

## Tech Stack

**Frontend:**
- React 18
- Vite
- TailwindCSS
- i18next for localization

**Backend:**
- Express.js
- MongoDB with Mongoose
- JWT authentication
- Resend API for email

## Project Structure

```
GameHub/
├── src/                 # Frontend source
│   ├── components/      # React components
│   ├── context/         # Auth context
│   ├── pages/           # Page components
│   └── i18n.js          # Localization
├── server/              # Backend
│   ├── models/          # Mongoose models
│   ├── routes/          # API routes
│   └── index.js         # Server entry
└── package.json
```

## Development

```bash
# Install dependencies
npm install
cd server && npm install

# Start frontend (port 5173)
npm run dev

# Start backend (port 5000)
cd server && npm start
```

## Environment Variables

**Frontend `.env`:**
```
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_API_BASE_URL=http://localhost:5000/api
```

**Backend `server/.env`:**
```
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
GOOGLE_CLIENT_ID=your_google_client_id
RESEND_API_KEY=your_resend_key
RESEND_FROM_EMAIL=your_sender_email
```

## Deployment

See `DEPLOY.md` for detailed deployment instructions.
