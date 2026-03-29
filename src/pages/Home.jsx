import { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { useCustomGames } from '../context/CustomGamesContext';
import GameCard from '../components/GameCard';

const normalizeTagValue = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
};

const normalizeSearchValue = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
};

const parseTagsSearchParam = (value) => {
  if (typeof value !== 'string' || value.trim() === '') return [];
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => normalizeTagValue(item))
        .filter(Boolean)
    )
  ).slice(0, 12);
};

const collectGameTags = (games = [], limit = 20) => {
  const unique = [];
  const seen = new Set();

  for (const game of games) {
    const sourceTags = Array.isArray(game?.tags) && game.tags.length > 0
      ? game.tags
      : [game?.category, game?.difficulty];

    for (const item of sourceTags) {
      const normalized = normalizeTagValue(item);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      unique.push(normalized);
    }
  }

  return unique.slice(0, limit);
};

const resolveGameTags = (game = {}) => {
  const normalizedTags = Array.isArray(game?.tags)
    ? game.tags.map((tag) => normalizeTagValue(tag)).filter(Boolean)
    : [];

  if (normalizedTags.length > 0) {
    return Array.from(new Set(normalizedTags)).slice(0, 12);
  }

  const fallbackTags = [game?.category, game?.difficulty]
    .map((tag) => normalizeTagValue(tag))
    .filter(Boolean);

  return Array.from(new Set(fallbackTags)).slice(0, 12);
};

export default function Home() {
  const { t } = useTranslation();
  const { user, toggleFavorite } = useAuth();
  const { customGames, loading } = useCustomGames();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = normalizeSearchValue(searchParams.get('q') || '');
  const selectedTags = useMemo(() => {
    const explicitTags = parseTagsSearchParam(searchParams.get('tags'));
    if (explicitTags.length > 0) return explicitTags;

    const legacyTag = normalizeTagValue(searchParams.get('tag'));
    return legacyTag ? [legacyTag] : [];
  }, [searchParams]);
  const tagMatchMode = selectedTags.length > 1 && searchParams.get('match') === 'any' ? 'any' : 'all';

  const allGames = customGames
    .filter((game) => {
      const hasPlayableUrl = typeof (game.url || game.embedUrl) === 'string' && (game.url || game.embedUrl).trim() !== '';
      return hasPlayableUrl || Boolean(game?.vipOnly);
    })
    .map((game) => ({
      ...game,
      tags: resolveGameTags(game),
      id: game._id || game.id,
      path: `/games/${game._id || game.id}`,
      image: game.imageUrl || game.image,
    }));

  const filteredGames = useMemo(() => {
    const normalizedQuery = searchQuery.toLowerCase();

    return allGames.filter((game) => {
      const gameTitle = normalizeSearchValue(game.title || '').toLowerCase();
      const matchesTitle = !normalizedQuery || gameTitle.includes(normalizedQuery);

      if (!matchesTitle) return false;
      if (selectedTags.length === 0) return true;

      if (tagMatchMode === 'any') {
        return selectedTags.some((tag) => game.tags.includes(tag));
      }

      return selectedTags.every((tag) => game.tags.includes(tag));
    });
  }, [allGames, searchQuery, selectedTags, tagMatchMode]);

  const ribbonTags = useMemo(() => {
    const tags = collectGameTags(allGames);
    if (tags.length > 0) return tags;
    return ['custom', 'arcade', 'medium'];
  }, [allGames]);

  const advancedSearchTags = useMemo(() => collectGameTags(allGames, 40), [allGames]);
  const orderedSearchTags = useMemo(() => {
    const selectedSet = new Set(selectedTags);
    return [...selectedTags, ...advancedSearchTags.filter((tag) => !selectedSet.has(tag))];
  }, [advancedSearchTags, selectedTags]);

  const filterSummary = useMemo(() => {
    const parts = [];
    if (searchQuery) {
      parts.push(t('home.summary.name', { query: searchQuery }));
    }

    if (selectedTags.length === 1) {
      parts.push(t('home.summary.singleTag', { tag: selectedTags[0] }));
    } else if (selectedTags.length > 1) {
      parts.push(t('home.summary.multiTag', { mode: tagMatchMode === 'any' ? 'ANY' : 'ALL', count: selectedTags.length }));
    }

    return parts.join(' • ');
  }, [searchQuery, selectedTags, tagMatchMode, t]);

  const handleFavorite = (e, gameId) => {
    e.preventDefault(); // Prevent navigation
    if (!user) {
      alert(t('home.alerts.loginToFavorite'));
      return;
    }
    toggleFavorite(gameId);
  };

  const scrollToGamesSection = () => {
    window.requestAnimationFrame(() => {
      document.getElementById('games')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const updateSearchFilters = ({ query, tags, matchMode } = {}, shouldScroll = false) => {
    const normalizedQuery = normalizeSearchValue(query ?? searchQuery);
    const normalizedTags = Array.from(
      new Set(
        (Array.isArray(tags) ? tags : selectedTags)
          .map((tag) => normalizeTagValue(tag))
          .filter(Boolean)
      )
    ).slice(0, 12);
    const normalizedMatchMode = matchMode === 'any' ? 'any' : 'all';

    const nextSearchParams = new URLSearchParams(searchParams);
    if (normalizedQuery) {
      nextSearchParams.set('q', normalizedQuery);
    } else {
      nextSearchParams.delete('q');
    }

    if (normalizedTags.length > 0) {
      nextSearchParams.set('tags', normalizedTags.join(','));
    } else {
      nextSearchParams.delete('tags');
    }

    if (normalizedTags.length > 1 && normalizedMatchMode === 'any') {
      nextSearchParams.set('match', 'any');
    } else {
      nextSearchParams.delete('match');
    }

    nextSearchParams.delete('tag');
    setSearchParams(nextSearchParams, { replace: true });

    if (shouldScroll) {
      scrollToGamesSection();
    }
  };

  const handleTagFilter = (tag, shouldScroll = false) => {
    const normalizedTag = normalizeTagValue(tag);
    if (!normalizedTag) return;

    const nextTags = selectedTags.includes(normalizedTag)
      ? selectedTags.filter((item) => item !== normalizedTag)
      : [...selectedTags, normalizedTag];

    updateSearchFilters({ tags: nextTags }, shouldScroll);
  };

  const handleSearchInput = (event) => {
    updateSearchFilters({ query: event.target.value }, false);
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    scrollToGamesSection();
  };

  const clearTagFilters = () => {
    updateSearchFilters({ tags: [], matchMode: 'all' }, false);
  };

  const clearAllFilters = () => {
    updateSearchFilters({ query: '', tags: [], matchMode: 'all' }, false);
  };

  const handleMatchModeChange = (mode) => {
    if (mode !== 'any' && mode !== 'all') return;
    updateSearchFilters({ matchMode: mode }, false);
  };

  const hasAnyFilter = Boolean(searchQuery) || selectedTags.length > 0;
  const noResultsFilterMessage = [
    searchQuery ? t('home.noResults.name', { query: searchQuery }) : '',
    selectedTags.length > 0
      ? t('home.noResults.tags', { mode: tagMatchMode === 'any' ? 'any' : 'all', tags: selectedTags.map((tag) => `#${tag}`).join(', ') })
      : ''
  ]
    .filter(Boolean)
    .join(' • ');

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [scrollY, setScrollY] = useState(0);
  const heroRef = useRef(null);

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

  return (
    <div className="min-h-screen bg-zinc-950 text-white selection:bg-white selection:text-black animate-page-in">
      <Navbar />
      
      {/* Background Elements with Parallax */}
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-800 via-zinc-950 to-zinc-950 opacity-40 animate-fade-in"></div>
      <div 
        className="fixed inset-0 z-0 bg-grid-pattern opacity-20 mask-image-gradient animate-fade-in"
        style={{ transform: `translateY(${scrollY * 0.1}px)` }}
      />

      {/* RGB Side Edge Glow */}
      <div className="rgb-edge rgb-edge-left">
        <div className="rgb-edge-glow" />
        <div className="rgb-edge-line" />
        <div className="rgb-edge-core" />
      </div>
      <div className="rgb-edge rgb-edge-right">
        <div className="rgb-edge-glow" />
        <div className="rgb-edge-line" />
        <div className="rgb-edge-core" />
      </div>

      {/* 3D Floating Orbs */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden perspective-1200">
        {/* Large cyan orb */}
        <div 
          className="absolute w-96 h-96 rounded-full bg-gradient-to-br from-cyan-500/20 to-transparent blur-3xl animate-float-3d"
          style={{ 
            top: '10%', 
            left: '10%',
            transform: `translate3d(${mousePos.x * 30}px, ${mousePos.y * 30 + scrollY * -0.2}px, 50px)`,
          }}
        />
        {/* Purple orb */}
        <div 
          className="absolute w-80 h-80 rounded-full bg-gradient-to-br from-purple-500/15 to-transparent blur-3xl animate-float-3d-reverse"
          style={{ 
            top: '30%', 
            right: '15%',
            transform: `translate3d(${mousePos.x * -20}px, ${mousePos.y * -20 + scrollY * -0.15}px, 30px)`,
          }}
        />
        {/* Pink orb */}
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
          className="absolute w-16 h-16 border border-purple-500/20 animate-rotate-3d"
          style={{ 
            top: '15%', 
            right: '12%',
            transform: `translate3d(${mousePos.x * -35}px, ${mousePos.y * -35}px, 60px)`,
          }}
        />
        <div 
          className="absolute w-12 h-12 border border-pink-500/20 rounded-full animate-orbit"
          style={{ 
            bottom: '35%', 
            right: '20%',
          }}
        />
        
        {/* Floating particles */}
        <div className="absolute w-2 h-2 bg-cyan-400/60 rounded-full top-[20%] left-[30%] animate-float-3d" />
        <div className="absolute w-1.5 h-1.5 bg-purple-400/60 rounded-full top-[40%] right-[25%] animate-float-3d-reverse" />
        <div className="absolute w-2.5 h-2.5 bg-pink-400/50 rounded-full bottom-[30%] left-[40%] animate-float-3d-slow" />
        <div className="absolute w-1 h-1 bg-white/40 rounded-full top-[35%] left-[50%] animate-pulse-3d" />
        <div className="absolute w-1.5 h-1.5 bg-cyan-300/50 rounded-full top-[55%] right-[35%] animate-float-3d" />
      </div>

      {/* Hero Section */}
      <section ref={heroRef} className="relative z-10 pt-40 pb-20 px-6 text-center perspective-1000">
        <div className="mx-auto mb-7 max-w-5xl rounded-2xl border border-white/10 bg-zinc-900/55 backdrop-blur-sm overflow-hidden animate-fade-up" style={{ '--delay': '35ms' }}>
          <div className="relative overflow-hidden border-b border-white/10 py-2.5">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-zinc-900 to-transparent z-10" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-zinc-900 to-transparent z-10" />
            <div className="marquee-track animate-marquee-left" style={{ '--marquee-duration': '26s' }}>
              <div className="marquee-group">
                {ribbonTags.map((item) => (
                  <button
                    key={`row-1-a-${item}`}
                    type="button"
                    onClick={() => handleTagFilter(item, true)}
                    className={`px-4 py-1 rounded-full text-[11px] font-bold tracking-[0.14em] uppercase border transition-colors ${
                      selectedTags.includes(item)
                        ? 'border-cyan-100 bg-cyan-200/25 text-white'
                        : 'border-cyan-300/35 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-300/20'
                    }`}
                  >
                    #{item}
                  </button>
                ))}
              </div>
              <div className="marquee-group">
                {ribbonTags.map((item) => (
                  <button
                    key={`row-1-b-${item}`}
                    type="button"
                    onClick={() => handleTagFilter(item, true)}
                    className={`px-4 py-1 rounded-full text-[11px] font-bold tracking-[0.14em] uppercase border transition-colors ${
                      selectedTags.includes(item)
                        ? 'border-cyan-100 bg-cyan-200/25 text-white'
                        : 'border-cyan-300/35 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-300/20'
                    }`}
                  >
                    #{item}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden py-2.5 bg-gradient-to-r from-fuchsia-500/10 via-amber-400/10 to-purple-500/10">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-zinc-900/80 to-transparent z-10" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-zinc-900/80 to-transparent z-10" />
            <div className="marquee-track animate-marquee-right" style={{ '--marquee-duration': '21s' }}>
              <div className="marquee-group">
                {ribbonTags.map((item) => (
                  <button
                    key={`row-2-a-${item}`}
                    type="button"
                    onClick={() => handleTagFilter(item, true)}
                    className={`px-4 py-1 rounded-full text-[11px] font-bold tracking-[0.14em] uppercase border transition-colors ${
                      selectedTags.includes(item)
                        ? 'border-fuchsia-100 bg-fuchsia-200/25 text-white'
                        : 'border-fuchsia-300/35 bg-fuchsia-400/10 text-fuchsia-100 hover:bg-fuchsia-300/20'
                    }`}
                  >
                    #{item}
                  </button>
                ))}
              </div>
              <div className="marquee-group">
                {ribbonTags.map((item) => (
                  <button
                    key={`row-2-b-${item}`}
                    type="button"
                    onClick={() => handleTagFilter(item, true)}
                    className={`px-4 py-1 rounded-full text-[11px] font-bold tracking-[0.14em] uppercase border transition-colors ${
                      selectedTags.includes(item)
                        ? 'border-fuchsia-100 bg-fuchsia-200/25 text-white'
                        : 'border-fuchsia-300/35 bg-fuchsia-400/10 text-fuchsia-100 hover:bg-fuchsia-300/20'
                    }`}
                  >
                    #{item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Version badge with shimmer */}
        <div className="inline-block mb-6 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-xs font-mono text-zinc-400 animate-pop-in relative overflow-hidden group hover:border-cyan-500/30 transition-colors">
          <span className="relative z-10">{t('home.hero.version')}</span>
          <div className="absolute inset-0 animate-shimmer opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* 3D Title with parallax */}
        <div 
          className="preserve-3d"
          style={{
            transform: `perspective(1000px) rotateX(${mousePos.y * -2}deg) rotateY(${mousePos.x * 2}deg)`,
            transition: 'transform 0.1s ease-out',
          }}
        >
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-tight animate-fade-up text-3d" style={{ '--delay': '80ms' }}>
            <span className="inline-block hover:animate-wave">{t('home.hero.titleTop')}</span> <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 animate-gradient-pan bg-[length:200%_auto]">
              {t('home.hero.titleBottom')}
            </span>
          </h1>
        </div>

        <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-12 leading-relaxed animate-fade-up" style={{ '--delay': '150ms' }}>
          {t('home.hero.subtitleLine1')} <br />
          <span className="text-zinc-300">{t('home.hero.subtitleLine2')}</span>
        </p>
        
        {/* 3D Buttons */}
        <div className="flex justify-center gap-4 animate-fade-up perspective-800" style={{ '--delay': '220ms' }}>
          <a 
            href="#games" 
            className="group relative px-8 py-4 font-bold tracking-wide overflow-hidden rounded-lg transition-all duration-300 hover:scale-105 hover:shadow-[0_0_40px_rgba(34,211,238,0.3)] preserve-3d"
            style={{ transformStyle: 'preserve-3d' }}
          >
            <span className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-cyan-400 to-cyan-500 bg-[length:200%_100%] animate-gradient-pan" />
            <span className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity" />
            <span className="absolute inset-[2px] bg-zinc-950 rounded-md opacity-0 group-active:opacity-100 transition-opacity" />
            <span className="relative z-10 text-black group-hover:text-white group-active:text-cyan-400 transition-colors flex items-center gap-2">
              <svg className="w-5 h-5 animate-bounce-3d" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('home.hero.startPlaying')}
            </span>
          </a>
          <a 
            href="https://github.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="group relative px-8 py-4 font-bold tracking-wide border-2 border-white/20 rounded-lg overflow-hidden transition-all duration-300 hover:border-purple-500/50 hover:shadow-[0_0_30px_rgba(168,85,247,0.2)] hover-lift-3d"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/10 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="relative z-10 flex items-center gap-2">
              <svg className="w-5 h-5 transition-transform group-hover:rotate-12" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              {t('home.hero.github')}
            </span>
          </a>
        </div>

        {/* Scroll indicator */}
        <div className="mt-16 animate-fade-up" style={{ '--delay': '350ms' }}>
          <div className="flex flex-col items-center gap-2 text-zinc-500">
            <span className="text-xs uppercase tracking-widest">{t('home.hero.scrollToExplore')}</span>
            <div className="w-6 h-10 rounded-full border-2 border-zinc-700 flex justify-center pt-2">
              <div className="w-1.5 h-3 bg-zinc-500 rounded-full animate-bounce-3d" />
            </div>
          </div>
        </div>
      </section>

      {/* Games Grid */}
      <section id="games" className="relative z-10 py-20 px-6 container mx-auto">
        {/* Section Header with 3D effect */}
        <div className="flex justify-between items-end mb-12 animate-fade-up perspective-800" style={{ '--delay': '120ms' }}>
          <div 
            className="animate-fade-up preserve-3d"
            style={{ 
              '--delay': '140ms',
              transform: `perspective(800px) rotateX(${scrollY > 400 ? 0 : 5}deg)`,
              transition: 'transform 0.5s ease-out',
            }}
          >
            <h2 className="text-4xl font-black italic tracking-tighter mb-2 text-3d">
              <span className="inline-block hover:animate-wave">{t('home.section.trending')}</span>{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">{t('home.section.games')}</span>
            </h2>
            <p className="text-zinc-500 font-mono flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              {filterSummary || t('home.section.mostPlayed')}
            </p>
          </div>
          <div className="hidden md:flex gap-2 animate-fade-up" style={{ '--delay': '190ms' }}>
            <button className="group w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] transition-all duration-300 hover-lift-3d">
              <span className="transition-transform group-hover:-translate-x-0.5">←</span>
            </button>
            <button className="group w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] transition-all duration-300 hover-lift-3d">
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          </div>
        </div>

        {/* Search Console with 3D glass effect */}
        <div
          className="group mb-10 rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-zinc-950/90 backdrop-blur-xl p-5 md:p-6 animate-fade-up shadow-[0_18px_45px_rgba(0,0,0,0.35)] hover:shadow-[0_25px_60px_rgba(0,0,0,0.4)] transition-all duration-500 relative overflow-hidden tilt-3d"
          style={{ '--delay': '150ms' }}
        >
          {/* Animated border glow */}
          <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
            <div className="absolute inset-[-1px] rounded-3xl bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 animate-gradient-pan bg-[length:200%_100%]" />
          </div>

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-[11px] font-black tracking-[0.2em] uppercase text-cyan-300/80 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                {t('home.search.console')}
              </p>
              <h3 className="text-lg md:text-xl font-black tracking-tight text-white">{t('home.search.title')}</h3>
            </div>

            {hasAnyFilter ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-4 py-2 rounded-xl border border-red-400/30 bg-red-500/10 text-red-200 text-xs font-bold tracking-[0.12em] uppercase hover:bg-red-500/20 hover:border-red-400/50 transition-all duration-300 hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]"
              >
                {t('home.search.resetAll')}
              </button>
            ) : (
              <span className="text-[11px] text-zinc-500 font-mono animate-pulse">{t('home.search.tip')}</span>
            )}
          </div>

          <form onSubmit={handleSearchSubmit} className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
            <label className="relative block group/input">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within/input:text-cyan-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchInput}
                placeholder={t('home.search.placeholder')}
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-950/75 pl-11 pr-4 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/40 transition-all duration-300"
              />
            </label>

            <button
              type="submit"
              className="group/btn relative px-5 py-3.5 rounded-2xl overflow-hidden text-sm font-bold tracking-[0.08em] uppercase transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(34,211,238,0.3)]"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-cyan-400 to-cyan-500 bg-[length:200%_100%] animate-gradient-pan" />
              <span className="absolute inset-0 bg-white/0 group-hover/btn:bg-white/20 transition-colors" />
              <span className="relative z-10 text-black flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                </svg>
                {t('home.search.button')}
              </span>
            </button>
          </form>

          {hasAnyFilter && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-zinc-500">{t('home.search.active')}</span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => updateSearchFilters({ query: '' }, false)}
                  className="px-3 py-1.5 rounded-full border border-orange-300/40 bg-orange-400/15 text-orange-100 text-xs font-bold uppercase tracking-[0.1em] hover:bg-orange-300/20 transition-colors"
                >
                  name:{' '}
                  <span className="normal-case">{searchQuery}</span>
                  {' '}×
                </button>
              )}
              {selectedTags.map((tag) => (
                <button
                  key={`active-filter-tag-${tag}`}
                  type="button"
                  onClick={() => handleTagFilter(tag)}
                  className="px-3 py-1.5 rounded-full border border-cyan-300/45 bg-cyan-300/20 text-cyan-50 text-xs font-bold uppercase tracking-[0.1em] hover:bg-cyan-200/30 transition-colors"
                >
                  #{tag} ×
                </button>
              ))}
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-white/10">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 mb-3">
              <div className="inline-flex w-fit rounded-xl border border-fuchsia-300/25 bg-fuchsia-400/5 p-1">
                <button
                  type="button"
                  onClick={() => handleMatchModeChange('all')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] transition-colors ${
                    tagMatchMode === 'all'
                      ? 'bg-fuchsia-300/25 text-white'
                      : 'text-fuchsia-100/80 hover:bg-fuchsia-300/15'
                  }`}
                >
                  {t('home.search.matchAll')}
                </button>
                <button
                  type="button"
                  onClick={() => handleMatchModeChange('any')}
                  disabled={selectedTags.length < 2}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                    tagMatchMode === 'any'
                      ? 'bg-fuchsia-300/25 text-white'
                      : 'text-fuchsia-100/80 hover:bg-fuchsia-300/15'
                  }`}
                >
                  {t('home.search.matchAny')}
                </button>
              </div>

              <p className="text-[11px] font-mono text-zinc-500">
                {selectedTags.length < 2
                  ? t('home.search.matchAnyHelp')
                  : t('home.search.currentMode', { mode: tagMatchMode.toUpperCase() })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-zinc-500">{t('home.search.quickTags')}</span>
              {ribbonTags.map((tag) => (
                <button
                  key={`quick-tag-${tag}`}
                  type="button"
                  onClick={() => handleTagFilter(tag)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-bold tracking-[0.1em] uppercase transition-colors ${
                    selectedTags.includes(tag)
                      ? 'border-cyan-200/70 bg-cyan-300/25 text-white'
                      : 'border-cyan-300/30 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-300/20'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>

            <div className="max-h-36 overflow-y-auto pr-1 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearTagFilters}
                className={`px-3 py-1.5 rounded-full border text-xs font-bold tracking-[0.1em] uppercase transition-colors ${
                  selectedTags.length > 0
                    ? 'border-white/15 bg-white/5 text-zinc-300 hover:bg-white/10'
                    : 'border-orange-300/60 bg-orange-400/20 text-orange-100'
                }`}
              >
                {t('home.search.allTag')}
              </button>

              {orderedSearchTags.map((tag) => (
                <button
                  key={`advanced-tag-${tag}`}
                  type="button"
                  onClick={() => handleTagFilter(tag)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-bold tracking-[0.1em] uppercase transition-colors ${
                    selectedTags.includes(tag)
                      ? 'border-emerald-200/70 bg-emerald-300/25 text-white'
                      : 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-300/20'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {loading ? (
          <div className="text-center py-20 text-zinc-500 animate-fade-in">{t('home.states.loadingGames')}</div>
        ) : filteredGames.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-5">
            {filteredGames.map((game, index) => (
              <GameCard 
                key={game.id} 
                game={game} 
                isFavorite={user?.favorites?.includes(game.id)}
                onToggleFavorite={(e) => handleFavorite(e, game.id)}
                onTagClick={handleTagFilter}
                index={index}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-zinc-500 animate-fade-in">
            {hasAnyFilter ? (
              <>
                <p>{t('home.states.noMatch')}</p>
                {noResultsFilterMessage && (
                  <p className="text-sm mt-2 text-zinc-400">{noResultsFilterMessage}</p>
                )}
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-4 px-4 py-2 rounded-lg border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10 transition-colors"
                >
                  {t('home.states.clearFilters')}
                </button>
              </>
            ) : (
              <>
                <p>{t('home.states.noGames')}</p>
                <p className="text-sm mt-2">{t('home.states.addGameHint')}</p>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
