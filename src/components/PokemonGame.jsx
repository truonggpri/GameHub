import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { POKEMON_DATA, calculateDamage, getAIMove, TYPE_NAMES, TYPE_EFFECTIVENESS } from '../data/pokemonData.js';

// Sound effects using Web Audio API
const playSound = (type) => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    switch (type) {
      case 'attack':
        oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.15);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.15);
        break;
      case 'hit':
        oscillator.frequency.setValueAtTime(100, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(30, audioContext.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
        break;
      case 'superEffective':
        oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
        break;
      case 'win':
        oscillator.frequency.setValueAtTime(261.63, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(329.63, audioContext.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(392.00, audioContext.currentTime + 0.2);
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.6);
        break;
      case 'lose':
        oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.5);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
        break;
    }
  } catch (e) {
    // Audio not supported
  }
};

// Pokemon Card Component - Simplified UI
const PokemonCard = ({ pokemon, isSelected, onClick, showStats = true, size = "normal" }) => {
  const sizeClasses = {
    small: "w-24 h-32",
    normal: "w-32 h-40",
    large: "w-40 h-52"
  };

  return (
    <div
      onClick={onClick}
      className={`${sizeClasses[size]} rounded-xl cursor-pointer transition-all duration-300 transform hover:scale-105 ${
        isSelected ? "ring-4 ring-yellow-400 scale-105 shadow-2xl" : "hover:shadow-xl"
      }`}
    >
      <div className={`h-full rounded-xl bg-gradient-to-br ${pokemon.color} p-2 flex flex-col items-center relative overflow-hidden`}>
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-2 left-2 text-4xl">{pokemon.emoji}</div>
          <div className="absolute bottom-2 right-2 text-4xl">{pokemon.emoji}</div>
        </div>
        
        {/* Pokemon sprite */}
        <div className="text-4xl mb-1 z-10 animate-bounce" style={{ animationDuration: '2s' }}>
          {pokemon.emoji}
        </div>
        
        {/* Name */}
        <div className="text-white font-bold text-xs text-center z-10">{pokemon.nameVi}</div>
        <div className="text-white/70 text-[10px] text-center z-10">{pokemon.name}</div>
        
        {/* Type badge */}
        <div className={`mt-1 px-2 py-0.5 rounded-full text-[10px] text-white font-medium ${TYPE_NAMES[pokemon.type].color} z-10`}>
          {TYPE_NAMES[pokemon.type].vi}
        </div>
        
        {/* Simplified Stats - Only HP and Level */}
        {showStats && (
          <div className="mt-2 w-full px-2 z-10">
            {/* Level */}
            <div className="flex justify-between items-center text-[10px] text-white/90 mb-1">
              <span>Lv. 50</span>
              <span>HP: {pokemon.hp}/{pokemon.maxHp || pokemon.hp}</span>
            </div>
            {/* HP Bar */}
            <div className="w-full h-2 bg-black/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-400 rounded-full transition-all"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// HP Bar Component with EXP Bar
const HPBar = ({ current, max, isPlayer, exp = 0, maxExp = 100 }) => {
  const percentage = Math.max(0, (current / max) * 100);
  let colorClass = "bg-green-500";
  if (percentage <= 50) colorClass = "bg-yellow-500";
  if (percentage <= 20) colorClass = "bg-red-500";

  return (
    <div className={`w-full ${isPlayer ? "" : "flex flex-col items-end"}`}>
      {/* Level and HP */}
      <div className="flex justify-between items-center text-xs font-bold text-gray-700 mb-1 w-full">
        <span>Lv. 50</span>
        <span>HP: {current}/{max}</span>
      </div>
      
      {/* HP Bar */}
      <div className="w-full h-3 bg-gray-300 rounded-full overflow-hidden border-2 border-gray-400 mb-1">
        <div
          className={`h-full ${colorClass} transition-all duration-500 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      {/* EXP Bar */}
      <div className="w-full">
        <div className="flex justify-between items-center text-[10px] text-gray-500 mb-0.5">
          <span>EXP</span>
          <span>{exp}/{maxExp}</span>
        </div>
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-400 transition-all duration-300"
            style={{ width: `${(exp / maxExp) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

// Battle Pokemon Display with EXP
const BattlePokemon = ({ pokemon, isPlayer, isAttacking, isHit, shake }) => {
  return (
    <div className={`relative flex flex-col items-center ${isPlayer ? "items-start" : "items-end"}`}>
      {/* Pokemon info */}
      <div className={`mb-2 ${isPlayer ? "text-left" : "text-right"}`}>
        <div className="text-lg font-bold text-gray-800">{pokemon.nameVi}</div>
      </div>
      
      {/* HP Bar with EXP */}
      <HPBar current={pokemon.hp} max={pokemon.maxHp} isPlayer={isPlayer} exp={pokemon.exp || 0} maxExp={pokemon.maxExp || 100} />
      
      {/* Pokemon Sprite */}
      <div
        className={`mt-4 text-8xl transition-all duration-300 ${
          isAttacking ? (isPlayer ? "translate-x-20" : "-translate-x-20") : ""
        } ${isHit ? "animate-pulse" : ""} ${shake ? "animate-shake" : ""}`}
        style={{
          animation: shake ? "shake 0.5s" : isAttacking ? "attack-bounce 0.3s" : "float 2s ease-in-out infinite",
          filter: pokemon.hp <= 0 ? "grayscale(100%)" : "none"
        }}
      >
        {pokemon.emoji}
      </div>
    </div>
  );
};

// Main Pokemon Game Component
const PokemonGame = () => {
  const { t } = useTranslation();
  const [gameState, setGameState] = useState("menu"); // menu, selection, battle, result
  const [selectedPokemon, setSelectedPokemon] = useState(null);
  const [playerPokemon, setPlayerPokemon] = useState(null);
  const [aiPokemon, setAiPokemon] = useState(null);
  const [battleLog, setBattleLog] = useState([]);
  const [turn, setTurn] = useState("player"); // player, ai
  const [isAnimating, setIsAnimating] = useState(false);
  const [playerAnim, setPlayerAnim] = useState({ attacking: false, hit: false });
  const [aiAnim, setAiAnim] = useState({ attacking: false, hit: false });
  const [effectiveness, setEffectiveness] = useState(null);
  const [battleStats, setBattleStats] = useState({ wins: 0, losses: 0, totalBattles: 0 });
  const [showTypeChart, setShowTypeChart] = useState(false);
  const aiProcessingRef = useRef(false); // Track if AI is processing its turn

  // Load stats from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('pokemonBattleStats');
    if (saved) {
      setBattleStats(JSON.parse(saved));
    }
  }, []);

  // Save stats
  const saveStats = useCallback((newStats) => {
    localStorage.setItem('pokemonBattleStats', JSON.stringify(newStats));
    setBattleStats(newStats);
  }, []);

  // Select Pokemon and start battle
  const selectPokemon = (pokemon) => {
    setSelectedPokemon(pokemon);
    const playerCopy = { ...pokemon, currentHp: pokemon.hp, buffs: { attack: 0, defense: 0, speed: 0 } };
    
    // AI selects random Pokemon (not same as player)
    const availablePokemon = POKEMON_DATA.filter(p => p.id !== pokemon.id);
    const aiChoice = availablePokemon[Math.floor(Math.random() * availablePokemon.length)];
    const aiCopy = { ...aiChoice, currentHp: aiChoice.hp, buffs: { attack: 0, defense: 0, speed: 0 } };
    
    setPlayerPokemon(playerCopy);
    setAiPokemon(aiCopy);
    setBattleLog([`Trận đấu bắt đầu! ${pokemon.nameVi} vs ${aiCopy.nameVi}`]);
    setTurn(playerCopy.speed >= aiCopy.speed ? "player" : "ai");
    setGameState("battle");
    setEffectiveness(null);
  };

  // Execute a move
  const executeMove = useCallback((move, attacker, defender, isPlayerAttacking) => {
    setIsAnimating(true);
    
    // Animation
    if (isPlayerAttacking) {
      setPlayerAnim({ attacking: true, hit: false });
    } else {
      setAiAnim({ attacking: true, hit: false });
    }
    
    playSound('attack');
    
    setTimeout(() => {
      if (isPlayerAttacking) {
        setPlayerAnim({ attacking: false, hit: false });
        setAiAnim({ attacking: false, hit: true });
      } else {
        setAiAnim({ attacking: false, hit: false });
        setPlayerAnim({ attacking: false, hit: true });
      }
      
      // Calculate damage
      const { damage, multiplier } = calculateDamage(move, attacker, defender);
      
      // Apply damage
      const newDefender = { ...defender, hp: Math.max(0, defender.hp - damage) };
      
      // Log message
      let message = `${attacker.nameVi} dùng ${move.nameVi}!`;
      let effectivenessMsg = null;
      
      if (multiplier >= 2) {
        effectivenessMsg = "Siêu hiệu quả!";
        playSound('superEffective');
      } else if (multiplier <= 0.5) {
        effectivenessMsg = "Không hiệu quả lắm...";
        playSound('hit');
      } else {
        playSound('hit');
      }
      
      setBattleLog(prev => [...prev.slice(-4), message, ...(effectivenessMsg ? [effectivenessMsg] : [])]);
      
      // Show effectiveness
      if (effectivenessMsg) {
        setEffectiveness({ msg: effectivenessMsg, isGood: multiplier >= 2 });
        setTimeout(() => setEffectiveness(null), 1500);
      }
      
      // Update state
      if (isPlayerAttacking) {
        setAiPokemon(newDefender);
      } else {
        setPlayerPokemon(newDefender);
      }
      
      setTimeout(() => {
        setPlayerAnim({ attacking: false, hit: false });
        setAiAnim({ attacking: false, hit: false });
        
        // Check for battle end
        if (newDefender.hp <= 0) {
          const winner = isPlayerAttacking ? playerPokemon : aiPokemon;
          const newStats = isPlayerAttacking 
            ? { ...battleStats, wins: battleStats.wins + 1, totalBattles: battleStats.totalBattles + 1 }
            : { ...battleStats, losses: battleStats.losses + 1, totalBattles: battleStats.totalBattles + 1 };
          saveStats(newStats);
          
          playSound(isPlayerAttacking ? 'win' : 'lose');
          setBattleLog(prev => [...prev, `${newDefender.nameVi} đã ngất đi!`, `${winner.nameVi} chiến thắng!`]);
          setTimeout(() => setGameState("result"), 1500);
        } else {
          setTurn(isPlayerAttacking ? "ai" : "player");
          setIsAnimating(false);
        }
      }, 800);
    }, 400);
  }, [playerPokemon, aiPokemon, battleStats, saveStats]);

  // Handle player move
  const handlePlayerMove = (move) => {
    if (turn !== "player" || isAnimating) return;
    
    if (move.type === "buff") {
      // Handle buff moves
      setIsAnimating(true);
      const buffAmount = 10;
      const newPlayer = { ...playerPokemon };
      
      if (move.effect === "attack") newPlayer.attack += buffAmount;
      if (move.effect === "defense") newPlayer.defense += buffAmount;
      if (move.effect === "speed") newPlayer.speed += buffAmount;
      if (move.effect === "all") {
        newPlayer.attack += 5;
        newPlayer.defense += 5;
        newPlayer.speed += 5;
      }
      
      setPlayerPokemon(newPlayer);
      setBattleLog(prev => [...prev.slice(-4), `${playerPokemon.nameVi} dùng ${move.nameVi}! Chỉ số tăng!`]);
      
      setTimeout(() => {
        setTurn("ai");
        setIsAnimating(false);
      }, 1000);
      return;
    }
    
    if (move.effect === "heal") {
      // Handle heal moves
      setIsAnimating(true);
      const healAmount = Math.floor(playerPokemon.maxHp * 0.3);
      const newHp = Math.min(playerPokemon.maxHp, playerPokemon.hp + healAmount);
      const newPlayer = { ...playerPokemon, hp: newHp };
      
      setPlayerPokemon(newPlayer);
      setBattleLog(prev => [...prev.slice(-4), `${playerPokemon.nameVi} dùng ${move.nameVi}! Hồi ${healAmount} HP!`]);
      
      setTimeout(() => {
        setTurn("ai");
        setIsAnimating(false);
      }, 1000);
      return;
    }
    
    executeMove(move, playerPokemon, aiPokemon, true);
  };

  // AI turn
  useEffect(() => {
    if (turn === "ai" && gameState === "battle" && !isAnimating && !aiProcessingRef.current) {
      aiProcessingRef.current = true;
      
      const timer = setTimeout(() => {
        // Double-check conditions inside timeout
        if (turn !== "ai" || gameState !== "battle") {
          aiProcessingRef.current = false;
          return;
        }
        
        const aiMove = getAIMove(aiPokemon, playerPokemon);
        
        if (aiMove.type === "buff") {
          setIsAnimating(true);
          const buffAmount = 10;
          const newAi = { ...aiPokemon };
          
          if (aiMove.effect === "attack") newAi.attack += buffAmount;
          if (aiMove.effect === "defense") newAi.defense += buffAmount;
          if (aiMove.effect === "speed") newAi.speed += buffAmount;
          if (aiMove.effect === "all") {
            newAi.attack += 5;
            newAi.defense += 5;
            newAi.speed += 5;
          }
          
          setAiPokemon(newAi);
          setBattleLog(prev => [...prev.slice(-4), `${aiPokemon.nameVi} dùng ${aiMove.nameVi}! Chỉ số tăng!`]);
          
          setTimeout(() => {
            setTurn("player");
            setIsAnimating(false);
            aiProcessingRef.current = false;
          }, 1000);
        } else if (aiMove.effect === "heal") {
          setIsAnimating(true);
          const healAmount = Math.floor(aiPokemon.maxHp * 0.3);
          const newHp = Math.min(aiPokemon.maxHp, aiPokemon.hp + healAmount);
          const newAi = { ...aiPokemon, hp: newHp };
          
          setAiPokemon(newAi);
          setBattleLog(prev => [...prev.slice(-4), `${aiPokemon.nameVi} dùng ${aiMove.nameVi}! Hồi ${healAmount} HP!`]);
          
          setTimeout(() => {
            setTurn("player");
            setIsAnimating(false);
            aiProcessingRef.current = false;
          }, 1000);
        } else {
          // For attack moves, executeMove handles the animation and turn switching
          // Reset aiProcessingRef after executeMove completes
          const originalExecuteMove = executeMove;
          const wrappedExecuteMove = (move, attacker, defender, isPlayerAttacking) => {
            originalExecuteMove(move, attacker, defender, isPlayerAttacking);
            // Reset ref after executeMove finishes its animation sequence
            setTimeout(() => {
              aiProcessingRef.current = false;
            }, 2000);
          };
          wrappedExecuteMove(aiMove, aiPokemon, playerPokemon, false);
        }
      }, 1500);
      
      return () => {
        clearTimeout(timer);
        // Only reset ref if component unmounts or dependencies change during AI processing
        // Don't reset here to prevent race conditions
      };
    }
  }, [turn, gameState, isAnimating, aiPokemon, playerPokemon, executeMove]);

  // Reset game
  const resetGame = () => {
    aiProcessingRef.current = false;
    setGameState("menu");
    setSelectedPokemon(null);
    setPlayerPokemon(null);
    setAiPokemon(null);
    setBattleLog([]);
    setTurn("player");
    setIsAnimating(false);
    setPlayerAnim({ attacking: false, hit: false });
    setAiAnim({ attacking: false, hit: false });
    setEffectiveness(null);
  };

  // Render based on game state
  const renderMenu = () => (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">⚡ 🐉 🔥</div>
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-500 to-purple-600 mb-2">
          {t('pokemonGame.title')}
        </h1>
        <p className="text-gray-600">{t('pokemonGame.subtitle')}</p>
      </div>
      
      {/* Stats */}
      <div className="bg-white rounded-xl shadow-lg p-4 mb-6 flex gap-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{battleStats.wins}</div>
          <div className="text-xs text-gray-500">{t('pokemonGame.stats.wins')}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">{battleStats.losses}</div>
          <div className="text-xs text-gray-500">{t('pokemonGame.stats.losses')}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{battleStats.totalBattles}</div>
          <div className="text-xs text-gray-500">{t('pokemonGame.stats.total')}</div>
        </div>
      </div>
      
      <div className="flex flex-col gap-3">
        <button
          onClick={() => setGameState("selection")}
          className="px-8 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
        >
          🎮 {t('pokemonGame.startBattle')}
        </button>
        <button
          onClick={() => setShowTypeChart(true)}
          className="px-8 py-3 bg-gradient-to-r from-blue-400 to-purple-500 text-white font-bold rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
        >
          📊 {t('pokemonGame.typeChartBtn')}
        </button>
      </div>
    </div>
  );

  const renderSelection = () => (
    <div className="h-full p-4 overflow-y-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{t('pokemonGame.selectPokemon')}</h2>
        <p className="text-gray-500 text-sm">{t('pokemonGame.clickToSelect')}</p>
      </div>
      
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
        {POKEMON_DATA.map((pokemon) => (
          <PokemonCard
            key={pokemon.id}
            pokemon={pokemon}
            isSelected={selectedPokemon?.id === pokemon.id}
            onClick={() => selectPokemon(pokemon)}
          />
        ))}
      </div>
      
      <button
        onClick={() => setGameState("menu")}
        className="mt-6 mx-auto block px-6 py-2 bg-gray-500 text-white rounded-full hover:bg-gray-600 transition-colors"
      >
        {t('pokemonGame.back')}
      </button>
    </div>
  );

  const renderBattle = () => (
    <div className="h-full flex flex-col p-4">
      {/* Battle Arena */}
      <div className="flex-1 relative bg-gradient-to-b from-sky-300 to-sky-100 rounded-2xl overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0">
          <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-green-400 to-green-300" />
          <div className="absolute top-4 right-4 text-4xl">☀️</div>
          <div className="absolute top-20 left-10 text-2xl opacity-50">☁️</div>
          <div className="absolute top-32 right-20 text-xl opacity-40">☁️</div>
        </div>
        
        {/* Effectiveness display */}
        {effectiveness && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className={`text-3xl font-bold ${effectiveness.isGood ? "text-green-600" : "text-gray-600"} animate-bounce drop-shadow-lg`}>
              {effectiveness.msg}
            </div>
          </div>
        )}
        
        {/* Battle field */}
        <div className="relative z-10 h-full flex justify-between items-center p-4 sm:p-8">
          {/* Player Pokemon */}
          <div className="flex-1">
            <BattlePokemon
              pokemon={playerPokemon}
              isPlayer={true}
              isAttacking={playerAnim.attacking}
              isHit={playerAnim.hit}
              shake={playerAnim.hit}
            />
          </div>
          
          {/* VS */}
          <div className="px-4">
            <div className="text-3xl font-black text-red-500 animate-pulse">VS</div>
          </div>
          
          {/* AI Pokemon */}
          <div className="flex-1">
            <BattlePokemon
              pokemon={aiPokemon}
              isPlayer={false}
              isAttacking={aiAnim.attacking}
              isHit={aiAnim.hit}
              shake={aiAnim.hit}
            />
          </div>
        </div>
      </div>
      
      {/* Battle UI */}
      <div className="mt-4 bg-white rounded-xl shadow-lg p-4">
        {/* Turn indicator */}
        <div className="text-center mb-3">
          <span className={`px-4 py-1 rounded-full text-sm font-bold ${
            turn === "player" ? "bg-green-500 text-white" : "bg-red-500 text-white"
          }`}>
            {turn === "player" ? t('pokemonGame.battle.yourTurn') : t('pokemonGame.battle.aiThinking')}
          </span>
        </div>
        
        {/* Battle Log */}
        <div className="bg-gray-100 rounded-lg p-3 mb-3 h-20 overflow-y-auto text-sm">
          {battleLog.map((log, i) => (
            <div key={i} className={`mb-1 ${
              log.includes("chiến thắng") ? "text-green-600 font-bold" : 
              log.includes("ngất") ? "text-red-600" :
              log.includes("Siêu") ? "text-yellow-600 font-bold" :
              "text-gray-700"
            }`}>
              {log}
            </div>
          ))}
        </div>
        
        {/* Move buttons */}
        <div className="grid grid-cols-2 gap-2">
          {playerPokemon?.moves.map((move, i) => (
            <button
              key={i}
              onClick={() => handlePlayerMove(move)}
              disabled={turn !== "player" || isAnimating}
              className={`py-3 px-4 rounded-lg font-bold text-white text-sm transition-all ${
                turn === "player" && !isAnimating
                  ? "hover:scale-105 active:scale-95 cursor-pointer"
                  : "opacity-50 cursor-not-allowed"
              } ${
                move.type === "fire" ? "bg-gradient-to-r from-orange-500 to-red-500" :
                move.type === "water" ? "bg-gradient-to-r from-blue-500 to-cyan-500" :
                move.type === "grass" ? "bg-gradient-to-r from-green-500 to-emerald-500" :
                move.type === "electric" ? "bg-gradient-to-r from-yellow-500 to-amber-500" :
                move.type === "rock" ? "bg-gradient-to-r from-stone-500 to-stone-700" :
                move.type === "flying" ? "bg-gradient-to-r from-sky-500 to-cyan-400" :
                move.type === "fighting" ? "bg-gradient-to-r from-red-500 to-rose-600" :
                move.type === "ghost" ? "bg-gradient-to-r from-purple-500 to-violet-600" :
                move.type === "fairy" ? "bg-gradient-to-r from-pink-500 to-rose-400" :
                move.type === "psychic" ? "bg-gradient-to-r from-violet-500 to-purple-600" :
                move.type === "buff" ? "bg-gradient-to-r from-green-600 to-emerald-600" :
                "bg-gradient-to-r from-gray-500 to-gray-600"
              }`}
            >
              <div className="flex flex-col items-center">
                <span>{move.nameVi}</span>
                <span className="text-xs opacity-75">
                  {move.power > 0 ? t('pokemonGame.moves.attack', { power: move.power }) : move.effect === "heal" ? t('pokemonGame.moves.heal') : t('pokemonGame.moves.buff')}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderResult = () => {
    const playerWon = playerPokemon.hp > 0;
    
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className={`text-8xl mb-4 ${playerWon ? "animate-bounce" : ""}`}>
          {playerWon ? "🏆" : "💔"}
        </div>
        
        <h2 className={`text-4xl font-bold mb-4 ${playerWon ? "text-green-600" : "text-red-600"}`}>
          {playerWon ? t('pokemonGame.battle.win') : t('pokemonGame.battle.lose')}
        </h2>
        
        <p className="text-gray-600 mb-6 text-center">
          {playerWon 
            ? t('pokemonGame.battle.victoryMessage', { winner: playerPokemon.nameVi, loser: aiPokemon.nameVi })
            : t('pokemonGame.battle.defeatMessage', { loser: playerPokemon.nameVi })
          }
        </p>
        
        {/* Rewards */}
        {playerWon && (
          <div className="bg-yellow-100 rounded-xl p-4 mb-6 flex items-center gap-4">
            <span className="text-4xl">⭐</span>
            <div>
              <div className="font-bold text-yellow-700">{t('pokemonGame.battle.rewards.xp')}</div>
              <div className="text-sm text-yellow-600">{t('pokemonGame.battle.rewards.coins')}</div>
            </div>
          </div>
        )}
        
        <div className="flex gap-3">
          <button
            onClick={() => setGameState("selection")}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
          >
            🔄 {t('pokemonGame.playAgain')}
          </button>
          <button
            onClick={resetGame}
            className="px-6 py-3 bg-gradient-to-r from-gray-500 to-gray-600 text-white font-bold rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
          >
            🏠 {t('pokemonGame.backToMenu')}
          </button>
        </div>
      </div>
    );
  };

  const renderTypeChart = () => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
        <div className="p-4 border-b">
          <h3 className="text-xl font-bold text-center">📊 {t('pokemonGame.typeChart.title')}</h3>
        </div>
        
        <div className="p-4">
          {Object.entries(TYPE_EFFECTIVENESS).map(([type, data]) => (
            <div key={type} className="mb-4">
              <div className={`inline-block px-3 py-1 rounded-full text-white font-bold text-sm mb-2 ${TYPE_NAMES[type]?.color || 'bg-gray-500'}`}>
                {TYPE_NAMES[type]?.vi || type}
              </div>
              <div className="text-sm">
                {data.strong.length > 0 && (
                  <div className="text-green-600">
                    <span className="font-medium">{t('pokemonGame.typeChart.strong')}: </span>
                    {data.strong.map(t => TYPE_NAMES[t]?.vi || t).join(", ")}
                  </div>
                )}
                {data.weak.length > 0 && (
                  <div className="text-red-500">
                    <span className="font-medium">{t('pokemonGame.typeChart.weak')}: </span>
                    {data.weak.map(t => TYPE_NAMES[t]?.vi || t).join(", ")}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        
        <div className="p-4 border-t">
          <button
            onClick={() => setShowTypeChart(false)}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold rounded-full"
          >
            {t('pokemonGame.back')}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full h-full min-h-[600px] bg-gray-100 rounded-xl overflow-hidden relative">
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px) rotate(-5deg); }
          50% { transform: translateX(10px) rotate(5deg); }
          75% { transform: translateX(-10px) rotate(-5deg); }
        }
        @keyframes attack-bounce {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
      
      {gameState === "menu" && renderMenu()}
      {gameState === "selection" && renderSelection()}
      {gameState === "battle" && renderBattle()}
      {gameState === "result" && renderResult()}
      {showTypeChart && renderTypeChart()}
    </div>
  );
};

export default PokemonGame;
