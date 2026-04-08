import { useNavigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import axios from 'axios';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import API_BASE_URL from '../config/api';

const ExclusivePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [scrollY, setScrollY] = useState(0);
  const [exclusiveGames, setExclusiveGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authError, setAuthError] = useState(false);

  // VIP check - redirect if not VIP
  useEffect(() => {
    if (user === null) {
      setAuthError(true);
      setLoading(false);
      return;
    }
    if (user && user.vipTier !== 'vip') {
      navigate('/membership');
    }
  }, [user, navigate]);

  // Fetch exclusive games from API
  useEffect(() => {
    const fetchExclusiveGames = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_BASE_URL}/games/exclusive`);
        // Map API response to component format
        const mappedGames = response.data.map(game => ({
          id: game._id || game.id,
          name: game.title,
          nameVi: game.descriptionVi || game.title,
          path: game.path || `/${game._id || game.id}`,
          category: game.category,
          categoryColor: game.category === 'RPG' ? 'from-yellow-400 to-orange-500' :
                        game.category === 'Arcade' ? 'from-green-400 to-emerald-500' :
                        game.category === 'Action' ? 'from-red-400 to-pink-500' :
                        'from-cyan-400 to-blue-500',
          description: game.description,
          descriptionVi: game.descriptionVi || game.description,
          image: game.imageUrl || game.image,
          tags: game.tags || [],
          difficulty: game.difficulty || 'Medium',
          difficultyColor: game.difficulty === 'Easy' ? 'bg-green-400' :
                          game.difficulty === 'Medium' ? 'bg-yellow-400' :
                          game.difficulty === 'Hard' ? 'bg-orange-400' :
                          'bg-red-400',
          playCount: game.playCount || 0,
          likeCount: game.likeCount || 0
        }));
        setExclusiveGames(mappedGames);
      } catch (err) {
        console.error('Error fetching exclusive games:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (user?.vipTier === 'vip') {
      fetchExclusiveGames();
    }
  }, [user]);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    const handleMouseMove = (e) => {
      setMousePos({
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const maxPlayCount = exclusiveGames.reduce((max, item) => Math.max(max, Number(item.playCount) || 0), 0);
  const maxLikeCount = exclusiveGames.reduce((max, item) => Math.max(max, Number(item.likeCount) || 0), 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-white selection:bg-white selection:text-black animate-page-in">
      {/* Background Elements with Parallax */}
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-800 via-zinc-950 to-zinc-950 opacity-40 animate-fade-in" />
      
      {/* 3D Floating Orbs */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden perspective-1200">
        <div 
          className="absolute w-96 h-96 rounded-full bg-gradient-to-br from-cyan-500/20 to-transparent blur-3xl animate-float-3d"
          style={{ 
            top: '10%', 
            left: '10%',
            transform: `translate3d(${mousePos.x * 30}px, ${mousePos.y * 30 + scrollY * -0.2}px, 50px)`,
          }}
        />
        <div 
          className="absolute w-80 h-80 rounded-full bg-gradient-to-br from-purple-500/15 to-transparent blur-3xl animate-float-3d-reverse"
          style={{ 
            top: '30%', 
            right: '15%',
            transform: `translate3d(${mousePos.x * -20}px, ${mousePos.y * -20 + scrollY * -0.15}px, 30px)`,
          }}
        />
        <div 
          className="absolute w-64 h-64 rounded-full bg-gradient-to-br from-pink-500/15 to-transparent blur-3xl animate-float-3d-slow"
          style={{ 
            bottom: '20%', 
            left: '20%',
            transform: `translate3d(${mousePos.x * 25}px, ${mousePos.y * 25 + scrollY * -0.1}px, 20px)`,
          }}
        />
        
        {/* Geometric shapes */}
        <div 
          className="absolute w-20 h-20 border border-cyan-500/20 rotate-45 animate-rotate-3d-slow"
          style={{ 
            top: '25%', 
            left: '8%',
            transform: `translate3d(${mousePos.x * 40}px, ${mousePos.y * 40}px, 80px) rotate(45deg)`,
          }}
        />
        <div 
          className="absolute w-16 h-16 border border-yellow-500/20 animate-rotate-3d"
          style={{ 
            top: '15%', 
            right: '12%',
            transform: `translate3d(${mousePos.x * -35}px, ${mousePos.y * -35}px, 60px)`,
          }}
        />
        
        {/* Floating particles */}
        <div className="absolute w-2 h-2 bg-cyan-400/60 rounded-full top-[20%] left-[30%] animate-float-3d" />
        <div className="absolute w-1.5 h-1.5 bg-yellow-400/60 rounded-full top-[40%] right-[25%] animate-float-3d-reverse" />
        <div className="absolute w-2.5 h-2.5 bg-orange-400/50 rounded-full bottom-[30%] left-[40%] animate-float-3d-slow" />
      </div>

      {/* Navbar */}
      <div className="relative z-50">
        <Navbar />
      </div>

      {/* Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center p-6 pointer-events-none">
        <div className="pointer-events-auto backdrop-blur-md border border-white/10 rounded-full px-6 py-3 flex items-center gap-6 shadow-2xl bg-zinc-900/80 animate-nav-drop">
          <Link to="/" className="flex items-center gap-2 text-white hover:text-cyan-400 transition-colors group">
            <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="font-medium text-sm">Back</span>
          </Link>
          
          <div className="h-5 w-px bg-gradient-to-b from-transparent via-white/30 to-transparent" />
          
          <div className="flex items-center gap-2">
            <span className="text-xl">👑</span>
            <span className="font-bold text-sm hidden sm:inline">Exclusive</span>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-40 pb-20 px-6 text-center perspective-1000">
        {/* Version badge */}
        <div className="inline-block mb-6 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-xs font-mono text-zinc-400 animate-pop-in relative overflow-hidden group hover:border-yellow-500/30 transition-colors">
          <span className="relative z-10 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            GameHub Exclusive Collection
          </span>
        </div>

        {/* 3D Title */}
        <div 
          className="preserve-3d"
          style={{
            transform: `perspective(1000px) rotateX(${mousePos.y * -2}deg) rotateY(${mousePos.x * 2}deg)`,
            transition: 'transform 0.1s ease-out',
          }}
        >
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-6 leading-tight animate-fade-up" style={{ '--delay': '80ms' }}>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-400 animate-gradient-pan bg-[length:200%_auto]">
              Exclusive Games
            </span>
          </h1>
        </div>

        <p className="text-lg text-zinc-400 max-w-2xl mx-auto mb-12 leading-relaxed animate-fade-up" style={{ '--delay': '150ms' }}>
          Experience unique games crafted exclusively by the GameHub team. 
          Each game is built with passion and attention to detail.
        </p>
      </section>

      {/* Games Section */}
      <section className="relative z-10 px-6 pb-20 container mx-auto max-w-6xl">
        {/* Section Header */}
        <div className="flex justify-between items-end mb-12 animate-fade-up" style={{ '--delay': '120ms' }}>
          <div>
            <h2 className="text-3xl font-black italic tracking-tighter mb-2">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
                Available Now
              </span>
            </h2>
            <p className="text-zinc-500 font-mono flex items-center gap-2 text-sm">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              {exclusiveGames.length} exclusive {exclusiveGames.length === 1 ? 'game' : 'games'}
            </p>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-12">
            <div className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Failed to load games. Please try again.</span>
            </div>
          </div>
        )}

        {/* Auth Error - Not Logged In */}
        {authError && (
          <div className="text-center py-16">
            <div className="inline-flex flex-col items-center gap-4 p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800">
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
                <svg className="w-8 h-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white">Đăng nhập để tiếp tục</h3>
              <p className="text-zinc-400 max-w-md">Bạn cần đăng nhập và nâng cấp VIP để truy cập Exclusive Games</p>
              <button 
                onClick={() => navigate('/login')}
                className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-semibold hover:opacity-90 transition-all"
              >
                Đăng nhập ngay
              </button>
            </div>
          </div>
        )}

        {/* Games Grid */}
        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exclusiveGames.map((game, index) => (
            (() => {
              const playCount = Number(game.playCount) || 0;
              const likeCount = Number(game.likeCount) || 0;
              const playRatio = maxPlayCount > 0 ? Math.min(100, Math.round((playCount / maxPlayCount) * 100)) : 0;
              const likeRatio = maxLikeCount > 0 ? Math.min(100, Math.round((likeCount / maxLikeCount) * 100)) : 0;
              const hasImage = typeof game.image === 'string' && game.image.trim() !== '';
              const displayTags = Array.isArray(game.tags) ? game.tags.filter(Boolean).slice(0, 4) : [];

              return (
            <div
              key={game.id}
              onClick={() => navigate(game.path)}
              className="group relative rounded-3xl border border-cyan-300/15 bg-gradient-to-b from-zinc-900/95 via-zinc-900/90 to-zinc-950/95 backdrop-blur-xl overflow-hidden cursor-pointer transition-all duration-500 hover:border-cyan-300/40 hover:shadow-[0_24px_55px_rgba(34,211,238,0.18)] hover:-translate-y-2 animate-fade-up"
              style={{ '--delay': `${200 + index * 100}ms` }}
            >
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_0%_0%,rgba(34,211,238,0.14),transparent_45%),radial-gradient(circle_at_100%_100%,rgba(244,114,182,0.12),transparent_40%)] opacity-80" />
              <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-tr from-cyan-300/0 via-cyan-200/10 to-white/0 z-10" />
              <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent pointer-events-none" />

              <div className="relative aspect-[16/10] overflow-hidden">
                {hasImage ? (
                  <img
                    src={game.image}
                    alt={game.name}
                    className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110"
                  />
                ) : (
                  <div className="w-full h-full bg-[linear-gradient(120deg,#0f172a_0%,#1f2937_42%,#111827_100%)] grid place-items-center">
                    <div className="text-center">
                      <div className="text-3xl mb-2">🎮</div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/75">Exclusive Mode</p>
                    </div>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-900/35 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent" />
                
                <div className="absolute top-3 left-3">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.12em] bg-gradient-to-r ${game.categoryColor} text-black shadow-[0_6px_18px_rgba(0,0,0,0.28)]`}>
                    {game.category}
                  </span>
                </div>

                <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/15 backdrop-blur-md border border-yellow-400/35 shadow-[0_0_20px_rgba(250,204,21,0.2)]">
                  <span className="text-xs">👑</span>
                  <span className="text-[10px] font-black text-yellow-300 uppercase tracking-[0.14em]">VIP</span>
                </div>

                <div className="absolute left-3 bottom-3 flex items-center gap-2 text-[11px]">
                  <span className="px-2 py-1 rounded-lg border border-cyan-300/30 bg-cyan-400/10 text-cyan-200 font-bold">▶ {playCount.toLocaleString()}</span>
                  <span className="px-2 py-1 rounded-lg border border-rose-300/30 bg-rose-400/10 text-rose-200 font-bold">❤ {likeCount.toLocaleString()}</span>
                </div>
              </div>

              <div className="relative p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <h3 className="text-lg font-black text-white group-hover:text-cyan-300 transition-colors leading-snug">
                    {game.name}
                  </h3>
                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800/90 border border-zinc-700 text-[10px] text-zinc-200 font-bold">
                    <span className={`w-2 h-2 rounded-full ${game.difficultyColor}`} />
                    {game.difficulty}
                  </span>
                </div>

                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-2.5">by GameHub Team</p>

                <p className="text-sm text-zinc-300/90 mb-4 line-clamp-2 leading-relaxed">
                  {game.description}
                </p>

                <div className="flex flex-wrap gap-1.5 mb-4 min-h-[1.8rem]">
                  {displayTags.length > 0 ? displayTags.map((tag, idx) => (
                    <span 
                      key={idx}
                      className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-zinc-300"
                    >
                      #{tag}
                    </span>
                  )) : (
                    <span className="text-[11px] text-zinc-500">No tags</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-2.5 py-2">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-cyan-200/90 font-bold mb-1.5">
                      <span>Play Heat</span>
                      <span>{playRatio}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-cyan-400/15 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-300" style={{ width: `${playRatio}%` }} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-rose-400/20 bg-rose-500/5 px-2.5 py-2">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-rose-200/90 font-bold mb-1.5">
                      <span>Like Pulse</span>
                      <span>{likeRatio}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-rose-400/15 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-pink-300" style={{ width: `${likeRatio}%` }} />
                    </div>
                  </div>
                </div>

                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(game.path);
                  }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-fuchsia-500 text-white font-black text-sm tracking-[0.08em] transition-all duration-300 flex items-center justify-center gap-2 border border-white/20 shadow-[0_10px_30px_rgba(59,130,246,0.35)] hover:brightness-110"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Bắt đầu chơi</span>
                </button>
              </div>

              <div className="absolute inset-0 rounded-3xl border border-white/0 group-hover:border-cyan-200/30 pointer-events-none transition-colors duration-500" />
            </div>
              );
            })()
          ))}
        </div>
        )}

        {/* Coming Soon Section */}

      </section>

      {/* Styles for animations */}
      <style>{`
        @keyframes float-3d {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        @keyframes float-3d-reverse {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(20px) rotate(-5deg); }
        }
        @keyframes float-3d-slow {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(3deg); }
        }
        @keyframes rotate-3d {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes rotate-3d-slow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(-360deg); }
        }
        @keyframes gradient-pan {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pop-in {
          0% { opacity: 0; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes nav-drop {
          0% { opacity: 0; transform: translateY(-20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-float-3d {
          animation: float-3d 6s ease-in-out infinite;
        }
        .animate-float-3d-reverse {
          animation: float-3d-reverse 7s ease-in-out infinite;
        }
        .animate-float-3d-slow {
          animation: float-3d-slow 8s ease-in-out infinite;
        }
        .animate-rotate-3d {
          animation: rotate-3d 20s linear infinite;
        }
        .animate-rotate-3d-slow {
          animation: rotate-3d-slow 25s linear infinite;
        }
        .animate-gradient-pan {
          animation: gradient-pan 3s ease infinite;
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }
        .animate-fade-up {
          animation: fade-up 0.6s ease-out forwards;
          animation-delay: var(--delay, 0ms);
          opacity: 0;
        }
        .animate-pop-in {
          animation: pop-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .animate-nav-drop {
          animation: nav-drop 0.5s ease-out;
        }
        .preserve-3d {
          transform-style: preserve-3d;
        }
        .perspective-1000 {
          perspective: 1000px;
        }
        .perspective-1200 {
          perspective: 1200px;
        }
      `}</style>
    </div>
  );
};

export default ExclusivePage;
