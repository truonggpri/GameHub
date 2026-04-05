import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

export default function Navbar() {
  const location = useLocation();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isActive = (path) => location.pathname === path;
  const [scrolled, setScrolled] = useState(false);
  const [openSupportCount, setOpenSupportCount] = useState(0);
  const navbarRef = useRef(null);
  const mouseRafRef = useRef(null);
  const targetRotateRef = useRef({ x: 0, y: 0 });
  const currentRotateRef = useRef({ x: 0, y: 0 });

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'en' ? 'vi' : 'en';
    i18n.changeLanguage(nextLang);
    localStorage.setItem('lang', nextLang);
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin') {
      setOpenSupportCount(0);
      return undefined;
    }

    const fetchOpenTicketCount = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'}/support/tickets`, {
          params: { status: 'open' },
          headers: { Authorization: `Bearer ${token}` }
        });
        const items = Array.isArray(res.data) ? res.data : [];
        setOpenSupportCount(items.length);
      } catch {
        setOpenSupportCount(0);
      }
    };

    fetchOpenTicketCount();
    const timer = window.setInterval(fetchOpenTicketCount, 10000);
    return () => window.clearInterval(timer);
  }, [user?.role]);

  const animateTilt = () => {
    const node = navbarRef.current;
    if (!node) {
      mouseRafRef.current = null;
      return;
    }

    const target = targetRotateRef.current;
    const current = currentRotateRef.current;

    current.x += (target.x - current.x) * 0.18;
    current.y += (target.y - current.y) * 0.18;

    if (Math.abs(target.x - current.x) < 0.01) current.x = target.x;
    if (Math.abs(target.y - current.y) < 0.01) current.y = target.y;

    node.style.setProperty('--nav-rotate-x', `${current.x.toFixed(2)}deg`);
    node.style.setProperty('--nav-rotate-y', `${current.y.toFixed(2)}deg`);

    const stillMoving = Math.abs(target.x - current.x) > 0.01 || Math.abs(target.y - current.y) > 0.01;
    if (stillMoving) {
      mouseRafRef.current = requestAnimationFrame(animateTilt);
      return;
    }

    mouseRafRef.current = null;
  };

  const startTiltAnimation = () => {
    if (mouseRafRef.current === null) {
      mouseRafRef.current = requestAnimationFrame(animateTilt);
    }
  };

  const handleMouseMove = (e) => {
    const node = navbarRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const normalizedX = (e.clientX - rect.left) / rect.width;
    const normalizedY = (e.clientY - rect.top) / rect.height;

    const centeredX = normalizedX * 2 - 1;
    const centeredY = normalizedY * 2 - 1;
    const easedX = Math.sign(centeredX) * Math.pow(Math.abs(centeredX), 1.25);
    const easedY = Math.sign(centeredY) * Math.pow(Math.abs(centeredY), 1.25);

    targetRotateRef.current = {
      x: Math.max(-4, Math.min(4, -easedY * 4)),
      y: Math.max(-6, Math.min(6, easedX * 6)),
    };

    startTiltAnimation();
  };

  const handleMouseLeave = () => {
    targetRotateRef.current = { x: 0, y: 0 };
    startTiltAnimation();
  };

  useEffect(() => {
    return () => {
      if (mouseRafRef.current) {
        cancelAnimationFrame(mouseRafRef.current);
      }
    };
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center p-6 pointer-events-none animate-nav-drop perspective-1000">
      <div 
        ref={navbarRef}
        className={`
          pointer-events-auto backdrop-blur-md border rounded-full px-6 py-3 
          flex items-center gap-8 shadow-2xl transition-all duration-500 preserve-3d
          ${scrolled 
            ? 'bg-zinc-950/95 border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.4)]' 
            : 'bg-zinc-900/80 border-white/10 animate-glow-pulse'}
        `}
        style={{
          transform: 'perspective(1000px) rotateX(var(--nav-rotate-x, 0deg)) rotateY(var(--nav-rotate-y, 0deg)) translateZ(10px)',
          transition: 'transform 0.06s linear',
          willChange: 'transform',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Animated gradient border */}
        <div className="absolute inset-0 rounded-full opacity-50 pointer-events-none overflow-hidden">
          <div className="absolute inset-[-2px] bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-full animate-gradient-pan opacity-30" />
        </div>

        {/* Logo with 3D effect */}
        <Link to="/" className="text-xl font-bold tracking-tighter flex items-center gap-2 group relative z-10">
          <span 
            className="w-9 h-9 bg-gradient-to-br from-white to-zinc-300 text-black rounded-xl flex items-center justify-center font-black shadow-lg transition-all duration-300 preserve-3d group-hover:shadow-[0_0_20px_rgba(255,255,255,0.5)]"
            style={{
              transform: 'translateZ(20px)',
              transformStyle: 'preserve-3d',
            }}
          >
            <span className="animate-pulse-3d">G</span>
          </span>
          <span className="hidden sm:inline relative">
            GameHub
            <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-cyan-400 to-purple-400 group-hover:w-full transition-all duration-300" />
          </span>
        </Link>
        
        <div className="h-6 w-px bg-gradient-to-b from-transparent via-white/30 to-transparent mx-2" />
        
        <div className="flex items-center gap-2 relative z-10">
          <NavLink to="/" active={isActive('/')}>{t('nav.home')}</NavLink>
          {user && <NavLink to="/membership" active={isActive('/membership')}>VIP</NavLink>}
          {user && (
            <div className="relative">
              <NavLink to="/support" active={isActive('/support')}>Support</NavLink>
              {user.role === 'admin' && openSupportCount > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full border border-red-300/50 bg-red-500 text-white text-[10px] font-black grid place-items-center leading-none">
                  {openSupportCount > 99 ? '99+' : openSupportCount}
                </span>
              )}
            </div>
          )}
          {['admin', 'mod'].includes(user?.role) && <NavLink to="/add-game" active={isActive('/add-game')}>{t('nav.addGame')}</NavLink>}
          {['admin', 'mod'].includes(user?.role) && <NavLink to="/admin" active={isActive('/admin')}>{t('nav.admin')}</NavLink>}
          
          {/* GameHub Exclusive Link */}
          <div className="relative">
            <NavLink to="/exclusive" active={isActive('/exclusive')}>
              <span className="flex items-center gap-1">
                <span>👑</span>
                <span className="hidden md:inline">Exclusive</span>
              </span>
            </NavLink>
            <span className="absolute -top-2 -right-1 px-1.5 py-0.5 rounded-full text-[7px] font-black bg-gradient-to-r from-yellow-400 to-orange-500 text-white border border-yellow-300/50">
              NEW
            </span>
          </div>
        </div>

        <div className="h-6 w-px bg-gradient-to-b from-transparent via-white/30 to-transparent mx-2" />

        <div className="flex items-center gap-4 relative z-10">
          <button
            type="button"
            onClick={toggleLanguage}
            className="text-[10px] font-bold px-2.5 py-1 rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
            title={t('nav.language')}
          >
            {i18n.language?.toUpperCase() || 'EN'}
          </button>
          {user ? (
            <Link to="/profile" className="flex items-center gap-2 group perspective-800">
              {user.isVip && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider border border-amber-400/40 bg-amber-500/20 text-amber-200">
                  VIP
                </span>
              )}
              <div 
                className={`w-9 h-9 rounded-full overflow-hidden border-2 border-purple-500 transition-all duration-300 group-hover:border-cyan-400 group-hover:shadow-[0_0_20px_rgba(34,211,238,0.5)] preserve-3d vip-avatar-frame ${user.isVip ? 'is-vip' : ''}`}
                style={{ transform: 'translateZ(15px)' }}
              >
                <img 
                  src={user.avatar} 
                  alt={user.username} 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                />
                {user.isVip && (
                  <>
                    <span className="vip-avatar-gem vip-avatar-gem--tl" />
                    <span className="vip-avatar-gem vip-avatar-gem--tr" />
                    <span className="vip-avatar-gem vip-avatar-gem--bl" />
                    <span className="vip-avatar-gem vip-avatar-gem--br" />
                    <span className="vip-avatar-crown vip-avatar-crown--md">👑</span>
                  </>
                )}
              </div>
            </Link>
          ) : (
            <Link 
              to="/login" 
              className="relative text-sm font-bold text-white px-5 py-2.5 rounded-full overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(168,85,247,0.5)] group"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 bg-[length:200%_100%] animate-gradient-pan" />
              <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 bg-[length:200%_100%] animate-gradient-pan" />
              <span className="relative z-10">{t('nav.login')}</span>
            </Link>
          )}
        </div>

        {/* Floating particles */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-full">
          <div className="absolute w-1 h-1 bg-cyan-400 rounded-full top-2 left-1/4 animate-float-3d opacity-60" />
          <div className="absolute w-1.5 h-1.5 bg-purple-400 rounded-full bottom-2 right-1/3 animate-float-3d-reverse opacity-50" />
          <div className="absolute w-1 h-1 bg-pink-400 rounded-full top-3 right-1/4 animate-float-3d-slow opacity-40" />
        </div>
      </div>
    </nav>
  );
}

function NavLink({ to, children, active }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Link 
      to={to}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative perspective-800"
    >
      <span 
        className={`
          relative z-10 block px-4 py-2 rounded-full text-sm font-medium transition-all duration-300
          ${active 
            ? 'text-black' 
            : 'text-zinc-400 hover:text-white'}
        `}
        style={{
          transform: isHovered && !active ? 'translateZ(10px) scale(1.05)' : 'translateZ(0) scale(1)',
          transition: 'transform 0.3s cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        {children}
      </span>
      
      {/* Background */}
      <span 
        className={`
          absolute inset-0 rounded-full transition-all duration-300
          ${active 
            ? 'bg-white shadow-[0_0_20px_rgba(255,255,255,0.4)]' 
            : isHovered 
              ? 'bg-white/10 shadow-[0_0_15px_rgba(255,255,255,0.1)]' 
              : 'bg-transparent'}
        `}
        style={{
          transform: active ? 'scale(1)' : isHovered ? 'scale(1.05)' : 'scale(0.95)',
          transition: 'all 0.3s cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      />

      {/* Active indicator glow */}
      {active && (
        <span className="absolute inset-0 rounded-full animate-glow-pulse opacity-50" />
      )}
    </Link>
  );
}
