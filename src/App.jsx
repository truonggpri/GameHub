import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CustomGamesProvider } from './context/CustomGamesContext';
import Home from './pages/Home';
import ComingSoon from './components/ComingSoon';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Profile from './pages/Profile';
import AddGame from './pages/AddGame';
import EmbeddedGame from './pages/EmbeddedGame';
import AdminPanel from './pages/AdminPanel';
import GameDetail from './pages/GameDetail';
import Membership from './pages/Membership';
import SupportChatbot from './components/SupportChatbot';

function App() {
  return (
    <AuthProvider>
      <CustomGamesProvider>
        <Router>
          <SupportChatbot />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/membership" element={<Membership />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/add-game" element={<AddGame />} />
            <Route path="/games/play/:id" element={<EmbeddedGame />} />
            <Route path="/games/:id" element={<GameDetail />} />
            <Route path="/games/*" element={<ComingSoon />} />
            <Route path="*" element={<ComingSoon />} />
          </Routes>
        </Router>
      </CustomGamesProvider>
    </AuthProvider>
  );
}

export default App;
