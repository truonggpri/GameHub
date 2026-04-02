import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CustomGamesProvider } from './context/CustomGamesContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Profile from './pages/Profile';
import AddGame from './pages/AddGame';
import EmbeddedGame from './pages/EmbeddedGame';
import AdminPanel from './pages/AdminPanel';
import GameDetail from './pages/GameDetail';
import Membership from './pages/Membership';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentCancel from './pages/PaymentCancel';
import Support from './pages/Support';
import SupportChatbot from './components/SupportChatbot';
import PokemonPage from './pages/PokemonPage';
import ExclusivePage from './pages/ExclusivePage';
import SnakeArenaPage from './pages/SnakeArenaPage';

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
            <Route path="/payment/success" element={<PaymentSuccess />} />
            <Route path="/payment/cancel" element={<PaymentCancel />} />
            <Route path="/support" element={<Support />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/add-game" element={<AddGame />} />
            <Route path="/exclusive" element={<ExclusivePage />} />
            <Route path="/pokemon" element={<PokemonPage />} />
            <Route path="/snake" element={<SnakeArenaPage />} />
            <Route path="/games/play/:id" element={<EmbeddedGame />} />
            <Route path="/games/:id" element={<GameDetail />} />
          </Routes>
        </Router>
      </CustomGamesProvider>
    </AuthProvider>
  );
}

export default App;
