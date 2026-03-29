import { Link } from 'react-router-dom';
import { useState, useRef, useCallback } from 'react';

const difficultyConfig = {
  Easy:   { color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/25', icon: '🟢' },
  Medium: { color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/25',   icon: '🟡' },
  Hard:   { color: 'text-orange-400',  bg: 'bg-orange-500/15',  border: 'border-orange-500/25',  icon: '🟠' },
  Expert: { color: 'text-red-400',     bg: 'bg-red-500/15',     border: 'border-red-500/25',     icon: '🔴' },
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function GameCard({ game, isFavorite, onToggleFavorite, onTagClick, index = 0 }) {
  const [isHovered, setIsHovered] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50 });
  const cardRef = useRef(null);

  const visibleTags = Array.isArray(game.tags)
    ? game.tags.filter((tag) => typeof tag === 'string' && tag.trim() !== '').slice(0, 4)
    : [];

  const title = game.title || 'Untitled Game';
  const description = game.description || '';
  const category = game.category || '';
  const difficulty = game.difficulty || '';
  const diffStyle = difficultyConfig[difficulty] || null;
  const publisher = game.publisher || '';
  const players = game.players || '';
  const controls = game.controls || '';
  const version = game.version || '';
  const rating = game.rating ? Number(game.rating) : 0;
  const addedDate = formatDate(game.createdAt);
  const vipOnly = Boolean(game.vipOnly);
  const vipLocked = Boolean(game.vipLocked);

  const handleMouseMove = useCallback((e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setTilt({
      x: (y - 0.5) * -14,
      y: (x - 0.5) * 14,
    });
    setGlarePos({ x: x * 100, y: y * 100 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0 });
  }, []);

  const accentColors = [
    { from: 'from-cyan-400', to: 'to-blue-500', glow: 'rgba(34,211,238,0.4)', ring: 'rgba(34,211,238,0.6)' },
    { from: 'from-purple-400', to: 'to-pink-500', glow: 'rgba(168,85,247,0.4)', ring: 'rgba(168,85,247,0.6)' },
    { from: 'from-emerald-400', to: 'to-teal-500', glow: 'rgba(52,211,153,0.4)', ring: 'rgba(52,211,153,0.6)' },
    { from: 'from-amber-400', to: 'to-orange-500', glow: 'rgba(251,191,36,0.4)', ring: 'rgba(251,191,36,0.6)' },
    { from: 'from-rose-400', to: 'to-red-500', glow: 'rgba(251,113,133,0.4)', ring: 'rgba(251,113,133,0.6)' },
  ];
  const accent = accentColors[index % accentColors.length];

  // Build info items from real data only
  const infoItems = [];
  if (players)    infoItems.push({ icon: '👥', label: 'Players', value: players });
  if (controls)   infoItems.push({ icon: '🎮', label: 'Controls', value: controls });
  if (publisher)  infoItems.push({ icon: '🏢', label: 'Publisher', value: publisher });
  if (version)    infoItems.push({ icon: '📦', label: 'Version', value: version });
  if (addedDate)  infoItems.push({ icon: '📅', label: 'Added', value: addedDate });

  return (
    <article
      ref={cardRef}
      className="animate-card-enter group"
      style={{
        '--delay': `${Math.min(index, 12) * 45}ms`,
        perspective: '600px',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="relative will-change-transform"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${isHovered ? 1.04 : 1})`,
          transition: isHovered
            ? 'transform 0.12s ease-out'
            : 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        {/* Card */}
        <div
          className="relative w-full rounded-2xl overflow-hidden bg-zinc-900"
          style={{
            aspectRatio: '3 / 4',
            boxShadow: isHovered
              ? `0 30px 60px -15px rgba(0,0,0,0.65), 0 0 35px -5px ${accent.glow}`
              : '0 4px 20px -5px rgba(0,0,0,0.4)',
            transition: 'box-shadow 0.4s ease-out',
          }}
        >
          {/* Image */}
          <img
            src={game.image}
            alt={title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              transform: isHovered ? 'scale(1.12)' : 'scale(1)',
              filter: isHovered ? 'brightness(0.25) saturate(1.2)' : 'brightness(0.85)',
              transition: 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1), filter 0.4s ease-out',
            }}
          />

          {/* Base gradient */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: isHovered
                ? 'linear-gradient(180deg, rgba(9,9,11,0.3) 0%, rgba(9,9,11,0.65) 35%, rgba(9,9,11,0.98) 65%)'
                : 'linear-gradient(180deg, transparent 40%, rgba(9,9,11,0.85) 90%)',
              transition: 'background 0.4s ease-out',
            }}
          />

          {/* 3D Glare overlay */}
          <div
            className="absolute inset-0 pointer-events-none rounded-2xl"
            style={{
              background: `radial-gradient(circle at ${glarePos.x}% ${glarePos.y}%, rgba(255,255,255,0.12) 0%, transparent 55%)`,
              opacity: isHovered ? 1 : 0,
              transition: 'opacity 0.3s',
            }}
          />

          {/* Accent ring on hover */}
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              boxShadow: `inset 0 0 0 1.5px ${accent.ring}`,
              opacity: isHovered ? 1 : 0,
              transition: 'opacity 0.3s',
            }}
          />

          {/* Top bar: badge + fav */}
          <div className="absolute top-0 inset-x-0 p-2.5 flex items-center justify-between z-20">
            <div className="flex items-center gap-1.5">
              {category ? (
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider text-white bg-gradient-to-r ${accent.from} ${accent.to} shadow-lg`}>
                  {category}
                </span>
              ) : null}
              {vipOnly && (
                <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider text-amber-100 bg-amber-500/20 border border-amber-400/30">
                  VIP
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite(e, game.id);
              }}
              className="relative p-1.5 rounded-full backdrop-blur-md transition-all duration-200"
              style={{
                background: isFavorite ? 'rgba(244,63,94,0.85)' : 'rgba(0,0,0,0.35)',
                transform: isHovered ? 'scale(1.1) translateZ(20px)' : 'scale(1)',
                boxShadow: isFavorite ? '0 0 12px rgba(244,63,94,0.5)' : 'none',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-white">
                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
              </svg>
            </button>
          </div>

          {/* Rating pill - only show if has real rating */}
          {rating > 0 && (
            <div
              className="absolute right-2.5 z-20"
              style={{
                top: '42%',
                opacity: isHovered ? 1 : 0,
                transform: isHovered ? 'translateX(0) translateZ(25px)' : 'translateX(10px)',
                transition: 'all 0.35s cubic-bezier(0.23, 1, 0.32, 1)',
                transitionDelay: isHovered ? '80ms' : '0ms',
              }}
            >
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-md border border-white/10">
                <span className="text-amber-400 text-[10px]">★</span>
                <span className="text-white text-[10px] font-bold">{rating.toFixed(1)}</span>
              </div>
            </div>
          )}

          {/* Bottom content area */}
          <div className="absolute inset-x-0 bottom-0 z-20 p-3">
            {/* Default state: title + basic info */}
            <div
              style={{
                opacity: isHovered ? 0 : 1,
                transform: isHovered ? 'translateY(-6px)' : 'translateY(0)',
                transition: 'all 0.25s ease-out',
                pointerEvents: isHovered ? 'none' : 'auto',
              }}
            >
              <h3 className="text-sm font-bold text-white truncate drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                {title}
              </h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {rating > 0 && (
                  <span className="text-[10px] font-bold text-amber-400">★ {rating.toFixed(1)}</span>
                )}
                {category && (
                  <span className="text-[10px] text-zinc-400">{category}</span>
                )}
                {difficulty && diffStyle && (
                  <span className={`text-[10px] font-medium ${diffStyle.color}`}>{diffStyle.icon} {difficulty}</span>
                )}
              </div>
            </div>

            {/* Hover state: full detailed info */}
            <div
              style={{
                position: 'absolute',
                inset: '0',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                opacity: isHovered ? 1 : 0,
                transform: isHovered ? 'translateY(0)' : 'translateY(16px)',
                transition: 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)',
                transitionDelay: isHovered ? '60ms' : '0ms',
                pointerEvents: isHovered ? 'auto' : 'none',
              }}
            >
              {/* Title */}
              <h3 className="text-sm font-extrabold text-white leading-tight line-clamp-2 mb-1 drop-shadow-lg">
                {title}
              </h3>

              {/* Publisher line */}
              {publisher && (
                <p className="text-[10px] text-zinc-500 mb-1.5 truncate">
                  by <span className="text-zinc-300 font-medium">{publisher}</span>
                </p>
              )}

              {/* Rating + Difficulty + Category row */}
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                {rating > 0 && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 text-[9px] font-bold text-amber-400">
                    ★ {rating.toFixed(1)}
                  </span>
                )}
                {difficulty && diffStyle && (
                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${diffStyle.color} ${diffStyle.bg} border ${diffStyle.border}`}>
                    {diffStyle.icon} {difficulty}
                  </span>
                )}
                {category && (
                  <span className="px-1.5 py-0.5 rounded bg-white/8 border border-white/8 text-[9px] font-medium text-zinc-300">
                    {category}
                  </span>
                )}
              </div>

              {/* Description */}
              {description && (
                <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed mb-2">
                  {description}
                </p>
              )}

              {/* Info grid - only real data */}
              {infoItems.length > 0 && (
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 mb-2">
                  {infoItems.slice(0, 4).map((item) => (
                    <div key={item.label} className="flex items-center gap-1 text-[9px] truncate">
                      <span>{item.icon}</span>
                      <span className="text-zinc-500">{item.label}:</span>
                      <span className="text-zinc-300 font-medium truncate">{item.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tags */}
              {visibleTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2.5">
                  {visibleTags.map((tag) => (
                    <button
                      key={`${game.id}-tag-${tag}`}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onTagClick?.(tag);
                      }}
                      className="px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-white/8 text-zinc-300 border border-white/8 hover:bg-cyan-500/20 hover:text-cyan-300 hover:border-cyan-500/30 transition-all duration-200"
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}

              {/* Play button */}
              <Link
                to={game.path}
                className="group/btn relative w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-extrabold uppercase tracking-wider text-white overflow-hidden transition-all duration-300 hover:shadow-lg"
                style={{
                  boxShadow: `0 4px 15px -3px ${accent.glow}`,
                }}
              >
                <span className={`absolute inset-0 bg-gradient-to-r ${accent.from} ${accent.to}`} />
                <span className="absolute inset-0 bg-white/0 group-hover/btn:bg-white/20 transition-colors duration-200" />
                <svg className="relative z-10 w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span className="relative z-10">{vipLocked ? 'VIP Access' : 'Play Now'}</span>
              </Link>
            </div>
          </div>

          {/* Shimmer line at bottom on hover */}
          <div
            className="absolute bottom-0 inset-x-0 h-[2px] z-30"
            style={{
              background: `linear-gradient(90deg, transparent, ${accent.ring}, transparent)`,
              opacity: isHovered ? 1 : 0,
              transition: 'opacity 0.4s',
            }}
          />
        </div>
      </div>
    </article>
  );
}
