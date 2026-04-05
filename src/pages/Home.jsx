import { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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

const normalizeNumericValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeTimestamp = (value) => {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

const FILTER_STORAGE_KEY = 'gamehub.home.filters.v1';
const HOME_SORT_OPTIONS = ['trending', 'mostPlayed', 'new'];

const normalizeSortValue = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return HOME_SORT_OPTIONS.includes(normalized) ? normalized : 'trending';
};

const parsePositiveMinutes = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(Math.round(parsed), 240);
};

const extractMinutesFromText = (value) => {
  if (typeof value !== 'string') return null;
  const matches = value.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  const numbers = matches.map((item) => Number(item)).filter(Number.isFinite);
  if (numbers.length === 0) return null;
  if (numbers.length >= 2) {
    return Math.round((numbers[0] + numbers[1]) / 2);
  }
  return numbers[0];
};

const resolveEstimatedMinutes = (game = {}) => {
  const directMinutes = parsePositiveMinutes(
    game?.estimatedMinutes
      ?? game?.estimatedTimeMinutes
      ?? game?.durationMinutes
      ?? game?.avgSessionMinutes
  );
  if (directMinutes) return directMinutes;

  const textMinutes = extractMinutesFromText(game?.estimatedTime || game?.duration || '');
  if (textMinutes) return parsePositiveMinutes(textMinutes) || textMinutes;

  const difficulty = typeof game?.difficulty === 'string' ? game.difficulty : '';
  if (difficulty === 'Easy') return 5;
  if (difficulty === 'Medium') return 10;
  if (difficulty === 'Hard') return 15;
  if (difficulty === 'Expert') return 20;
  return 10;
};

export default function Home() {
  const { t } = useTranslation();
  const { user, toggleFavorite } = useAuth();
  const { customGames, loading } = useCustomGames();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasRestoredFiltersRef = useRef(false);
  const searchQuery = normalizeSearchValue(searchParams.get('q') || '');
  const sortBy = normalizeSortValue(searchParams.get('sort'));
  const maxMinutes = parsePositiveMinutes(searchParams.get('maxMinutes'));
  const selectedTags = useMemo(() => {
    const explicitTags = parseTagsSearchParam(searchParams.get('tags'));
    if (explicitTags.length > 0) return explicitTags;

    const legacyTag = normalizeTagValue(searchParams.get('tag'));
    return legacyTag ? [legacyTag] : [];
  }, [searchParams]);
  const tagMatchMode = selectedTags.length > 1 && searchParams.get('match') === 'any' ? 'any' : 'all';

  const allGames = useMemo(() => (
    customGames
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
        estimatedMinutes: resolveEstimatedMinutes(game)
      }))
  ), [customGames]);

  const filteredGames = useMemo(() => {
    const normalizedQuery = searchQuery.toLowerCase();

    return allGames.filter((game) => {
      const gameTitle = normalizeSearchValue(game.title || '').toLowerCase();
      const matchesTitle = !normalizedQuery || gameTitle.includes(normalizedQuery);

      if (!matchesTitle) return false;
      if (maxMinutes && game.estimatedMinutes > maxMinutes) return false;
      if (selectedTags.length === 0) return true;

      if (tagMatchMode === 'any') {
        return selectedTags.some((tag) => game.tags.includes(tag));
      }

      return selectedTags.every((tag) => game.tags.includes(tag));
    });
  }, [allGames, searchQuery, selectedTags, tagMatchMode, maxMinutes]);

  const sortedFilteredGames = useMemo(() => {
    const cloned = [...filteredGames];

    if (sortBy === 'mostPlayed') {
      return cloned.sort((a, b) => {
        const playDiff = normalizeNumericValue(b.playCount) - normalizeNumericValue(a.playCount);
        if (playDiff !== 0) return playDiff;
        const likeDiff = normalizeNumericValue(b.likeCount) - normalizeNumericValue(a.likeCount);
        if (likeDiff !== 0) return likeDiff;
        return normalizeTimestamp(b.createdAt) - normalizeTimestamp(a.createdAt);
      });
    }

    if (sortBy === 'new') {
      return cloned.sort((a, b) => {
        const dateDiff = normalizeTimestamp(b.createdAt) - normalizeTimestamp(a.createdAt);
        if (dateDiff !== 0) return dateDiff;
        return normalizeNumericValue(b.playCount) - normalizeNumericValue(a.playCount);
      });
    }

    return cloned.sort((a, b) => {
      const scoreA = (
        normalizeNumericValue(a.playCount) * 0.55
        + normalizeNumericValue(a.likeCount) * 1.25
        + normalizeNumericValue(a.rating) * 12
        + Math.max(0, 30 - Math.floor((Date.now() - normalizeTimestamp(a.createdAt)) / 86400000))
      );
      const scoreB = (
        normalizeNumericValue(b.playCount) * 0.55
        + normalizeNumericValue(b.likeCount) * 1.25
        + normalizeNumericValue(b.rating) * 12
        + Math.max(0, 30 - Math.floor((Date.now() - normalizeTimestamp(b.createdAt)) / 86400000))
      );
      return scoreB - scoreA;
    });
  }, [filteredGames, sortBy]);

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

  const heroPopularGames = useMemo(() => {
    return [...allGames]
      .sort((a, b) => {
        const playDiff = normalizeNumericValue(b.playCount) - normalizeNumericValue(a.playCount);
        if (playDiff !== 0) return playDiff;
        const likeDiff = normalizeNumericValue(b.likeCount) - normalizeNumericValue(a.likeCount);
        if (likeDiff !== 0) return likeDiff;
        return normalizeNumericValue(b.rating) - normalizeNumericValue(a.rating);
      })
      .slice(0, 3);
  }, [allGames]);

  const heroNewGames = useMemo(() => {
    const popularIds = new Set(heroPopularGames.map((game) => game.id));
    const sortedByDate = [...allGames].sort((a, b) => normalizeTimestamp(b.createdAt) - normalizeTimestamp(a.createdAt));
    const uniqueFresh = sortedByDate.filter((game) => !popularIds.has(game.id));
    return (uniqueFresh.length > 0 ? uniqueFresh : sortedByDate).slice(0, 3);
  }, [allGames, heroPopularGames]);

  const heroShowcaseGames = useMemo(() => {
    const merged = [...heroPopularGames, ...heroNewGames];
    const seen = new Set();
    return merged.filter((game) => {
      if (seen.has(game.id)) return false;
      seen.add(game.id);
      return true;
    }).slice(0, 3);
  }, [heroPopularGames, heroNewGames]);

  const heroStats = useMemo(() => {
    const totalPlays = allGames.reduce((sum, game) => sum + normalizeNumericValue(game.playCount), 0);
    const totalLikes = allGames.reduce((sum, game) => sum + normalizeNumericValue(game.likeCount), 0);
    const newCount = heroNewGames.length;
    return {
      totalGames: allGames.length,
      totalPlays,
      totalLikes,
      newCount
    };
  }, [allGames, heroNewGames]);

  const heroPopularIdSet = useMemo(() => new Set(heroPopularGames.map((game) => game.id)), [heroPopularGames]);

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

  const updateSearchFilters = ({ query, tags, matchMode, sort, maxMinutes: nextMaxMinutes } = {}, shouldScroll = false) => {
    const normalizedQuery = normalizeSearchValue(query ?? searchQuery);
    const normalizedTags = Array.from(
      new Set(
        (Array.isArray(tags) ? tags : selectedTags)
          .map((tag) => normalizeTagValue(tag))
          .filter(Boolean)
      )
    ).slice(0, 12);
    const normalizedMatchMode = matchMode === 'any' ? 'any' : 'all';
    const normalizedSort = normalizeSortValue(typeof sort === 'string' ? sort : sortBy);
    const normalizedMaxMinutes = parsePositiveMinutes(nextMaxMinutes ?? maxMinutes);

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

    if (normalizedSort !== 'trending') {
      nextSearchParams.set('sort', normalizedSort);
    } else {
      nextSearchParams.delete('sort');
    }

    if (normalizedMaxMinutes) {
      nextSearchParams.set('maxMinutes', String(normalizedMaxMinutes));
    } else {
      nextSearchParams.delete('maxMinutes');
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
    updateSearchFilters({ query: '', tags: [], matchMode: 'all', maxMinutes: null, sort: 'trending' }, false);
  };

  const handleMatchModeChange = (mode) => {
    if (mode !== 'any' && mode !== 'all') return;
    updateSearchFilters({ matchMode: mode }, false);
  };

  const handleSortChange = (event) => {
    updateSearchFilters({ sort: event.target.value }, false);
  };

  useEffect(() => {
    if (hasRestoredFiltersRef.current) return;
    hasRestoredFiltersRef.current = true;
    const hasManagedQuery = ['q', 'tags', 'tag', 'match', 'sort', 'maxMinutes'].some((key) => searchParams.get(key));
    if (hasManagedQuery) return;

    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;

      const nextParams = new URLSearchParams();
      const restoredQuery = normalizeSearchValue(parsed.q || '');
      const restoredTags = Array.isArray(parsed.tags)
        ? parsed.tags.map((tag) => normalizeTagValue(tag)).filter(Boolean).slice(0, 12)
        : [];
      const restoredMatch = parsed.match === 'any' ? 'any' : 'all';
      const restoredSort = normalizeSortValue(parsed.sort);
      const restoredMaxMinutes = parsePositiveMinutes(parsed.maxMinutes);

      if (restoredQuery) nextParams.set('q', restoredQuery);
      if (restoredTags.length > 0) nextParams.set('tags', restoredTags.join(','));
      if (restoredTags.length > 1 && restoredMatch === 'any') nextParams.set('match', 'any');
      if (restoredSort !== 'trending') nextParams.set('sort', restoredSort);
      if (restoredMaxMinutes) nextParams.set('maxMinutes', String(restoredMaxMinutes));

      if (Array.from(nextParams.keys()).length > 0) {
        setSearchParams(nextParams, { replace: true });
      }
    } catch {
      localStorage.removeItem(FILTER_STORAGE_KEY);
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const payload = {
      q: searchQuery,
      tags: selectedTags,
      match: tagMatchMode,
      sort: sortBy,
      maxMinutes
    };
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(payload));
  }, [searchQuery, selectedTags, tagMatchMode, sortBy, maxMinutes]);

  const hasAnyFilter = Boolean(searchQuery) || selectedTags.length > 0 || Boolean(maxMinutes);
  const noResultsFilterMessage = [
    searchQuery ? t('home.noResults.name', { query: searchQuery }) : '',
    selectedTags.length > 0
      ? t('home.noResults.tags', { mode: tagMatchMode === 'any' ? 'any' : 'all', tags: selectedTags.map((tag) => `#${tag}`).join(', ') })
      : '',
    maxMinutes ? `≤ ${maxMinutes} min` : ''
  ]
    .filter(Boolean)
    .join(' • ');

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [scrollY, setScrollY] = useState(0);
  const [showcaseOrder, setShowcaseOrder] = useState([]);
  const [hoveredShowcaseId, setHoveredShowcaseId] = useState(null);
  const heroRef = useRef(null);

  useEffect(() => {
    const ids = heroShowcaseGames.map((game) => game.id);
    setShowcaseOrder((prev) => {
      const existing = prev.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !existing.includes(id));
      const nextOrder = [...existing, ...missing];
      if (prev.length === nextOrder.length && prev.every((id, index) => id === nextOrder[index])) {
        return prev;
      }
      return nextOrder;
    });
  }, [heroShowcaseGames]);

  useEffect(() => {
    if (!hoveredShowcaseId) return;
    const exists = heroShowcaseGames.some((game) => game.id === hoveredShowcaseId);
    if (!exists) {
      setHoveredShowcaseId(null);
    }
  }, [heroShowcaseGames, hoveredShowcaseId]);

  const orderedShowcaseGames = useMemo(() => {
    const gameMap = new Map(heroShowcaseGames.map((game) => [game.id, game]));
    const validOrder = showcaseOrder.filter((id) => gameMap.has(id));
    const missing = heroShowcaseGames.map((game) => game.id).filter((id) => !validOrder.includes(id));
    return [...validOrder, ...missing]
      .map((id) => gameMap.get(id))
      .filter(Boolean);
  }, [heroShowcaseGames, showcaseOrder]);

  const showcasedDetailGame = orderedShowcaseGames.find((game) => game.id === hoveredShowcaseId) || null;
  const maxShowcasePlays = orderedShowcaseGames.reduce((max, game) => Math.max(max, normalizeNumericValue(game.playCount)), 0);
  const maxShowcaseLikes = orderedShowcaseGames.reduce((max, game) => Math.max(max, normalizeNumericValue(game.likeCount)), 0);
  const detailPlayCount = normalizeNumericValue(showcasedDetailGame?.playCount);
  const detailLikeCount = normalizeNumericValue(showcasedDetailGame?.likeCount);
  const detailPlayProgress = maxShowcasePlays > 0 ? Math.min(100, Math.round((detailPlayCount / maxShowcasePlays) * 100)) : 0;
  const detailLikeProgress = maxShowcaseLikes > 0 ? Math.min(100, Math.round((detailLikeCount / maxShowcaseLikes) * 100)) : 0;

  const bringShowcaseToFront = (gameId) => {
    setShowcaseOrder((prev) => [gameId, ...prev.filter((id) => id !== gameId)]);
  };

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
            href="https://github.com/truonggpri/GameHub" 
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

      <section className="relative z-10 px-6 pb-8 -mt-8 container mx-auto">
        <div className="relative overflow-hidden rounded-[36px] border border-white/12 bg-gradient-to-br from-[#5f7de8]/88 via-[#715fc9]/86 to-[#8452b8]/88 p-6 sm:p-8 lg:p-10 shadow-[0_30px_80px_rgba(31,19,76,0.48)] animate-fade-up" style={{ '--delay': '170ms' }}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.14),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(6,182,212,0.12),transparent_35%)]" />
          <div className="pointer-events-none absolute right-[-120px] top-1/2 h-[320px] w-[320px] -translate-y-1/2 rounded-full border border-black/15 bg-black/10" />

          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-8 lg:gap-10 items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] font-black text-cyan-100/90 mb-3">{t('home.showcase.featuredHub')}</p>
              <h3 className="text-3xl sm:text-4xl xl:text-5xl font-black leading-tight text-white drop-shadow-[0_5px_24px_rgba(0,0,0,0.25)]">
                {t('home.showcase.popularNewTitle')}
              </h3>
              <p className="mt-4 max-w-xl text-sm sm:text-base text-indigo-100/90 leading-relaxed">
                {t('home.showcase.description')}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={scrollToGamesSection}
                  className="px-6 py-3 rounded-full bg-white text-indigo-700 font-black text-sm tracking-wide hover:bg-cyan-50 transition-colors"
                >
                  {t('home.showcase.exploreGames')}
                </button>
                {heroPopularGames[0] && (
                  <Link
                    to={heroPopularGames[0].path}
                    className="px-6 py-3 rounded-full border border-white/45 bg-white/10 text-white font-black text-sm tracking-wide hover:bg-white/20 transition-colors"
                  >
                    {t('home.showcase.playHotGame')}
                  </Link>
                )}
              </div>

              <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-2xl border border-white/20 bg-black/15 backdrop-blur-sm p-2.5">
                {[
                  { label: 'Games', value: heroStats.totalGames },
                  { label: 'Popular', value: heroPopularGames.length },
                  { label: 'Plays', value: heroStats.totalPlays },
                  { label: 'New', value: heroStats.newCount }
                ].map((item) => (
                  <div key={item.label} className="rounded-xl bg-white/10 px-3 py-2.5 text-center border border-white/15">
                    <p className="text-lg sm:text-xl font-black text-white leading-none">{item.value}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-indigo-100/85 font-bold">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative min-h-[360px] sm:min-h-[400px] lg:min-h-[420px]" onMouseLeave={() => setHoveredShowcaseId(null)}>
              {orderedShowcaseGames.map((game, idx) => {
                const imageUrl = typeof game.image === 'string' ? game.image.trim() : '';
                const playCount = normalizeNumericValue(game.playCount);
                const likeCount = normalizeNumericValue(game.likeCount);
                const topOffset = 20 + (idx * 42);
                const leftOffset = 8 + (idx * 54);
                const depth = 68 - (idx * 16);
                const rotate = -14 + (idx * 9);
                const isFront = idx === 0;
                const isHoveredCard = hoveredShowcaseId === game.id;
                const floatOffset = Math.sin(scrollY / 120 + idx * 1.3) * (6 - idx * 1.1);
                const sideOffset = Math.cos(scrollY / 180 + idx * 0.9) * (3 - idx * 0.4);
                const hoverLift = isHoveredCard ? -14 : 0;
                const stackScale = isFront ? 1 : 0.93 - (idx * 0.01);
                return (
                  <button
                    key={`showcase-${game.id}`}
                    type="button"
                    onClick={() => bringShowcaseToFront(game.id)}
                    onMouseEnter={() => setHoveredShowcaseId(game.id)}
                    className="absolute block w-[68%] sm:w-[62%] max-w-[320px] group text-left"
                    style={{
                      top: `${topOffset}px`,
                      left: `${leftOffset}px`,
                      transform: `translate3d(${mousePos.x * (14 - idx * 2.3) + sideOffset}px, ${mousePos.y * (8.5 - idx * 1.6) + floatOffset + hoverLift}px, ${depth + (isHoveredCard ? 12 : 0)}px) rotate(${rotate + (isHoveredCard ? 1.4 : 0)}deg) rotateX(${mousePos.y * (-3.2 + idx * 0.15)}deg) rotateY(${mousePos.x * (5.8 - idx * 0.2)}deg) scale(${stackScale + (isHoveredCard ? 0.035 : 0)})`,
                      transformStyle: 'preserve-3d',
                      transition: 'transform 620ms cubic-bezier(0.22, 1, 0.36, 1), filter 450ms ease, z-index 0ms linear 120ms',
                      filter: isHoveredCard ? 'brightness(1.07)' : 'brightness(1)',
                      zIndex: 30 - idx
                    }}
                  >
                    <article className={`rounded-2xl border backdrop-blur-sm overflow-hidden transition-all duration-500 ${isFront ? 'border-cyan-200/35 bg-[#10162f]/90 shadow-[0_25px_55px_rgba(8,145,178,0.28)]' : 'border-white/18 bg-[#111129]/82 shadow-[0_16px_30px_rgba(0,0,0,0.35)] group-hover:shadow-[0_25px_55px_rgba(20,184,166,0.24)] group-hover:border-cyan-200/28'} ${isHoveredCard ? 'shadow-[0_32px_70px_rgba(34,211,238,0.26)]' : ''}`}>
                      <div className="relative h-36 sm:h-40 bg-zinc-900">
                        {imageUrl ? (
                          <img src={imageUrl} alt={game.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-zinc-700 via-zinc-900 to-black" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                        <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/55 border border-white/20 text-[10px] text-cyan-200 font-bold uppercase tracking-[0.12em]">
                          {heroPopularIdSet.has(game.id) ? t('home.showcase.popularPick') : t('home.showcase.freshDrop')}
                        </div>
                        {!isFront && (
                          <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/55 border border-white/20 text-[9px] text-white/90 font-bold uppercase tracking-[0.12em]">
                            {t('home.showcase.clickToFront')}
                          </div>
                        )}
                      </div>
                      <div className="p-3.5">
                        <h4 className="text-sm font-black text-white truncate">{game.title}</h4>
                        <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-300 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded border border-cyan-400/40 bg-cyan-400/10">▶ {playCount}</span>
                          <span className="px-1.5 py-0.5 rounded border border-rose-400/40 bg-rose-400/10">❤ {likeCount}</span>
                          {game.category && <span className="text-zinc-400">{game.category}</span>}
                        </div>
                      </div>
                    </article>
                  </button>
                );
              })}

              <div
                className={`absolute right-0 bottom-0 w-full sm:w-[84%] rounded-2xl border backdrop-blur-xl p-4 transition-all duration-500 ${showcasedDetailGame ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto border-cyan-300/35 bg-[#0b1230]/88 shadow-[0_22px_55px_rgba(9,16,41,0.68)]' : 'opacity-0 translate-y-6 scale-[0.98] pointer-events-none border-transparent bg-transparent'}`}
                style={{ zIndex: 60 }}
              >
                {showcasedDetailGame && (
                  <>
                    <div className="absolute inset-0 rounded-2xl pointer-events-none bg-[linear-gradient(120deg,rgba(56,189,248,0.12),transparent_36%,rgba(232,121,249,0.11))]" />
                    <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/65 to-transparent" />
                    <div className="relative z-10 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex items-start gap-3">
                        <div className="w-14 h-14 rounded-xl border border-white/15 overflow-hidden bg-zinc-900 shrink-0">
                          {typeof showcasedDetailGame.image === 'string' && showcasedDetailGame.image.trim() ? (
                            <img src={showcasedDetailGame.image} alt={showcasedDetailGame.title} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-zinc-700 via-zinc-900 to-black" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200/90 font-bold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse" />
                            {t('home.showcase.hoverPreview')}
                          </p>
                          <h4 className="text-base sm:text-lg font-black text-white truncate">{showcasedDetailGame.title}</h4>
                          <p className="mt-1 text-[11px] text-zinc-400">{heroPopularIdSet.has(showcasedDetailGame.id) ? t('home.showcase.popularPicks') : t('home.showcase.newlyAdded')}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => bringShowcaseToFront(showcasedDetailGame.id)}
                        className="shrink-0 px-3 py-1.5 rounded-lg border border-cyan-300/35 bg-cyan-400/10 text-cyan-100 text-[10px] font-black uppercase tracking-[0.14em] hover:bg-cyan-400/20 transition-colors"
                      >
                        {t('home.showcase.bringFront')}
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-200">
                      <span className="px-2 py-1 rounded-md border border-cyan-400/35 bg-cyan-400/10">▶ {normalizeNumericValue(showcasedDetailGame.playCount)} plays</span>
                      <span className="px-2 py-1 rounded-md border border-rose-400/35 bg-rose-400/10">❤ {normalizeNumericValue(showcasedDetailGame.likeCount)} likes</span>
                      {showcasedDetailGame.category && (
                        <span className="px-2 py-1 rounded-md border border-white/20 bg-white/5 text-zinc-300">{showcasedDetailGame.category}</span>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="rounded-xl border border-white/12 bg-white/[0.04] p-2.5">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-cyan-200/90 font-bold">
                          <span>{t('home.showcase.playHeat')}</span>
                          <span>{detailPlayProgress}%</span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-cyan-400/15 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-300 transition-all duration-500" style={{ width: `${detailPlayProgress}%` }} />
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/12 bg-white/[0.04] p-2.5">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-rose-200/90 font-bold">
                          <span>{t('home.showcase.likePulse')}</span>
                          <span>{detailLikeProgress}%</span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-rose-400/15 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-pink-300 transition-all duration-500" style={{ width: `${detailLikeProgress}%` }} />
                        </div>
                      </div>
                    </div>

                    <p className="relative z-10 mt-3 text-xs text-zinc-300/85 line-clamp-2 leading-relaxed">
                      {showcasedDetailGame.description || t('home.showcase.cardHint')}
                    </p>

                    <div className="relative z-10 mt-4 flex items-center gap-2">
                      <Link
                        to={showcasedDetailGame.path}
                        className="px-4 py-2 rounded-lg bg-cyan-300 text-zinc-900 text-xs font-black uppercase tracking-[0.12em] hover:bg-cyan-200 transition-colors"
                      >
                        {t('home.showcase.viewDetails')}
                      </Link>
                      <button
                        type="button"
                        onClick={scrollToGamesSection}
                        className="px-4 py-2 rounded-lg border border-white/20 bg-white/5 text-zinc-100 text-xs font-black uppercase tracking-[0.12em] hover:bg-white/10 transition-colors"
                      >
                        {t('home.showcase.viewAll')}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {orderedShowcaseGames.length === 0 && (
                <div className="absolute inset-0 rounded-2xl border border-dashed border-white/30 bg-black/20 grid place-items-center text-sm text-indigo-100/90">
                  {t('home.showcase.noData')}
                </div>
              )}
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
              {maxMinutes && (
                <button
                  type="button"
                  onClick={() => updateSearchFilters({ maxMinutes: null }, false)}
                  className="px-3 py-1.5 rounded-full border border-sky-300/45 bg-sky-300/20 text-sky-50 text-xs font-bold uppercase tracking-[0.1em] hover:bg-sky-200/30 transition-colors"
                >
                  time: ≤ {maxMinutes} min ×
                </button>
              )}
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

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-zinc-500">{t('home.search.sortLabel', { defaultValue: 'Sort' })}</span>
              <select
                value={sortBy}
                onChange={handleSortChange}
                className="rounded-xl border border-white/12 bg-zinc-950/70 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              >
                <option value="trending">{t('home.search.sortTrending', { defaultValue: 'Trending' })}</option>
                <option value="mostPlayed">{t('home.search.sortMostPlayed', { defaultValue: 'Most Played' })}</option>
                <option value="new">{t('home.search.sortNew', { defaultValue: 'New' })}</option>
              </select>
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
        ) : sortedFilteredGames.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-5">
            {sortedFilteredGames.map((game, index) => (
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
