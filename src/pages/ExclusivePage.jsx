import { useNavigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

const ExclusivePage = () => {
  const navigate = useNavigate();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [scrollY, setScrollY] = useState(0);

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

  // Exclusive games list
  const exclusiveGames = [
    {
      id: 'pokemon',
      name: 'Pokemon Battle',
      nameVi: 'Đấu Pokemon',
      icon: '⚡',
      emoji: '🔥',
      path: '/pokemon',
      description: 'Turn-based battle game with 12 unique Pokemon',
      descriptionVi: 'Game đấu turn-based với 12 Pokemon độc đáo',
      color: 'from-yellow-400 to-orange-500',
      features: ['12 Pokemon', 'Type System', 'AI Battle', 'Stats Tracking'],
      players: 'Single Player',
      difficulty: 'Medium'
    },
    {
      id: 'snake',
      name: 'Snake Arena',
      nameVi: 'Rắn Săn Mồi',
      icon: '🐍',
      emoji: '🐍',
      path: '/snake',
      description: 'Classic snake game with power-ups and arena modes',
      descriptionVi: 'Game rắn săn mồi cổ điển với power-ups và chế độ arena',
      color: 'from-green-400 to-emerald-500',
      features: ['Power-ups', 'Arena Mode', 'High Scores', '3 Game Modes'],
      players: 'Single Player',
      difficulty: 'Easy'
    }
  ];

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

        {/* Games Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exclusiveGames.map((game, index) => (
            <div
              key={game.id}
              onClick={() => navigate(game.path)}
              className="group relative rounded-2xl border border-white/10 bg-zinc-900/60 backdrop-blur-sm overflow-hidden cursor-pointer transition-all duration-500 hover:border-yellow-400/50 hover:shadow-[0_0_40px_rgba(251,191,36,0.2)] hover:-translate-y-2 animate-fade-up"
              style={{ '--delay': `${200 + index * 100}ms` }}
            >
              {/* Animated border glow on hover */}
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                <div className="absolute inset-[-1px] rounded-2xl bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-pink-500/20 animate-gradient-pan bg-[length:200%_100%]" />
              </div>

              {/* Card Header */}
              <div className={`h-40 bg-gradient-to-br ${game.color} relative overflow-hidden`}>
                {/* Background pattern */}
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute top-4 left-4 text-4xl">{game.emoji}</div>
                  <div className="absolute bottom-4 right-4 text-4xl">{game.emoji}</div>
                </div>
                
                {/* Floating animation */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-7xl animate-float-3d drop-shadow-2xl">
                    {game.emoji}
                  </span>
                </div>

                {/* Exclusive Badge */}
                <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm border border-yellow-400/50">
                  <span className="text-[10px] font-black text-yellow-400 uppercase tracking-wider">Exclusive</span>
                </div>
              </div>

              {/* Card Content */}
              <div className="p-5 relative">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-xl font-black text-white group-hover:text-yellow-400 transition-colors flex items-center gap-2">
                      {game.icon} {game.name}
                    </h3>
                    <p className="text-sm text-zinc-400">{game.nameVi}</p>
                  </div>
                </div>

                <p className="text-sm text-zinc-400 mb-4 line-clamp-2">
                  {game.description}
                </p>

                {/* Features */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {game.features.map((feature, idx) => (
                    <span 
                      key={idx}
                      className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] font-medium text-zinc-300"
                    >
                      {feature}
                    </span>
                  ))}
                </div>

                {/* Meta Info */}
                <div className="flex items-center gap-4 text-xs text-zinc-500 border-t border-white/10 pt-4">
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {game.players}
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                    {game.difficulty}
                  </span>
                </div>

                {/* Play Button */}
                <button className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold text-sm hover:from-yellow-400 hover:to-orange-400 transition-all duration-300 hover:shadow-[0_0_20px_rgba(251,191,36,0.3)] flex items-center justify-center gap-2 group/btn">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Play Now</span>
                  <svg className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Coming Soon Section */}
        <div className="mt-20 text-center animate-fade-up" style={{ '--delay': '400ms' }}>
          <div className="inline-flex items-center gap-4 px-8 py-4 rounded-2xl border border-white/10 bg-zinc-900/50 backdrop-blur-sm">
            <span className="text-3xl animate-bounce">🚧</span>
            <div className="text-left">
              <p className="text-base font-bold text-white">More Games Coming Soon</p>
              <p className="text-xs text-zinc-500">Stay tuned for new exclusive experiences</p>
            </div>
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" style={{ animationDelay: '200ms' }} />
              <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse" style={{ animationDelay: '400ms' }} />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-8 mt-20">
        <div className="container mx-auto px-6 text-center">
          <p className="text-sm text-zinc-500">
            GameHub Exclusive Collection © 2026
          </p>
        </div>
      </footer>

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
