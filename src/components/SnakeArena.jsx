import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Game constants
const GRID_SIZE = 20;
const CELL_SIZE = 25;
const INITIAL_SPEED = 150;
const MIN_SPEED = 50;

// Sound effects
const playSound = (type) => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    switch (type) {
      case 'move':
        oscillator.frequency.value = 150;
        gainNode.gain.value = 0.05;
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.05);
        break;
      case 'eat':
        oscillator.frequency.value = 400;
        gainNode.gain.value = 0.1;
        oscillator.start();
        oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.1);
        oscillator.stop(audioContext.currentTime + 0.1);
        break;
      case 'powerup':
        oscillator.frequency.value = 600;
        gainNode.gain.value = 0.15;
        oscillator.start();
        oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.2);
        oscillator.stop(audioContext.currentTime + 0.2);
        break;
      case 'die':
        oscillator.frequency.value = 200;
        gainNode.gain.value = 0.15;
        oscillator.start();
        oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.3);
        oscillator.stop(audioContext.currentTime + 0.3);
        break;
      default:
        break;
    }
  } catch (e) {
    // Audio not supported
  }
};

// Generate random position not on snake or obstacles
const getRandomPosition = (snake, obstacles, width, height) => {
  let pos;
  let attempts = 0;
  do {
    pos = {
      x: Math.floor(Math.random() * width),
      y: Math.floor(Math.random() * height)
    };
    attempts++;
  } while (
    attempts < 100 && (
      snake.some(s => s.x === pos.x && s.y === pos.y) ||
      obstacles.some(o => o.x === pos.x && o.y === pos.y)
    )
  );
  return pos;
};

// Power-up types
const POWERUPS = {
  SPEED: { type: 'speed', emoji: '⚡', color: '#fbbf24', duration: 5000 },
  SLOW: { type: 'slow', emoji: '🐌', color: '#60a5fa', duration: 5000 },
  DOUBLE: { type: 'double', emoji: '✨', color: '#f472b6', duration: 10000 },
  GHOST: { type: 'ghost', emoji: '👻', color: '#a78bfa', duration: 3000 }
};

const SnakeArena = () => {
  const { t } = useTranslation();
  
  // Game state
  const [gameState, setGameState] = useState('menu'); // menu, playing, paused, gameover
  const [snake, setSnake] = useState([{ x: 10, y: 10 }]);
  const [direction, setDirection] = useState({ x: 0, y: 0 });
  const [nextDirection, setNextDirection] = useState({ x: 0, y: 0 });
  const [food, setFood] = useState({ x: 15, y: 15 });
  const [powerUp, setPowerUp] = useState(null);
  const [obstacles, setObstacles] = useState([]);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('snakeHighScore')) || 0;
  });
  const [level, setLevel] = useState(1);
  const [speed, setSpeed] = useState(INITIAL_SPEED);
  const [activePowerUp, setActivePowerUp] = useState(null);
  const [combo, setCombo] = useState(0);
  const [arenaSize, setArenaSize] = useState({ width: 25, height: 25 });
  const [gameMode, setGameMode] = useState('classic'); // classic, arena, endless, ai
  const [showInstructions, setShowInstructions] = useState(false);
  
  // AI Mode state
  const [aiSnakes, setAiSnakes] = useState([]);
  const [aiScores, setAiScores] = useState({});
  const [gameRankings, setGameRankings] = useState([]);
  const [winner, setWinner] = useState(null);
  
  const gameLoopRef = useRef(null);
  const canvasRef = useRef(null);
  const powerUpTimerRef = useRef(null);
  const aiUpdateRef = useRef(null);

  // AI Snake Logic - Calculate best direction for AI
  const getAIdirection = useCallback((aiSnake, allSnakes, targetFood) => {
    const head = aiSnake.body[0];
    const currentDir = aiSnake.direction;
    
    const directions = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 }
    ];
    
    // Filter valid directions (not 180 turn)
    const validDirs = directions.filter(dir => 
      !(dir.x === -currentDir.x && dir.y === -currentDir.y)
    );
    
    const scoredDirs = validDirs.map(dir => {
      const newHead = { x: head.x + dir.x, y: head.y + dir.y };
      let score = 0;
      
      // Check collisions
      const isWall = newHead.x < 0 || newHead.x >= arenaSize.width || 
                     newHead.y < 0 || newHead.y >= arenaSize.height;
      
      const isSelf = aiSnake.body.some((seg, idx) => 
        idx > 0 && seg.x === newHead.x && seg.y === newHead.y
      );
      
      const isOtherSnake = allSnakes.some(other => 
        other.id !== aiSnake.id && other.body.some(seg => 
          seg.x === newHead.x && seg.y === newHead.y
        )
      );
      
      const isObstacle = obstacles.some(obs => 
        obs.x === newHead.x && obs.y === newHead.y
      );
      
      if (isWall || isSelf || isOtherSnake || isObstacle) {
        return { dir, score: -1000 };
      }
      
      // Distance to food
      if (targetFood) {
        const distToFood = Math.abs(newHead.x - targetFood.x) + Math.abs(newHead.y - targetFood.y);
        score += (30 - distToFood) * 3;
      }
      
      // Space availability (flood fill limited)
      let freeSpace = 0;
      const visited = new Set();
      const queue = [newHead];
      const maxCheck = 20;
      
      while (queue.length > 0 && freeSpace < maxCheck) {
        const pos = queue.shift();
        const key = `${pos.x},${pos.y}`;
        if (visited.has(key)) continue;
        visited.add(key);
        freeSpace++;
        
        [[1,0], [-1,0], [0,1], [0,-1]].forEach(([dx, dy]) => {
          const nx = pos.x + dx, ny = pos.y + dy;
          if (nx >= 0 && nx < arenaSize.width && ny >= 0 && ny < arenaSize.height) {
            const blocked = allSnakes.some(s => 
              s.body.some(seg => seg.x === nx && seg.y === ny)
            ) || obstacles.some(obs => obs.x === nx && obs.y === ny);
            if (!blocked && !visited.has(`${nx},${ny}`)) {
              queue.push({ x: nx, y: ny });
            }
          }
        });
      }
      
      score += freeSpace * 2;
      
      // Prefer continuing in same direction
      if (dir.x === currentDir.x && dir.y === currentDir.y) {
        score += 5;
      }
      
      // Small randomness
      score += Math.random() * 3;
      
      return { dir, score };
    });
    
    scoredDirs.sort((a, b) => b.score - a.score);
    
    if (scoredDirs[0] && scoredDirs[0].score > -1000) {
      return scoredDirs[0].dir;
    }
    return currentDir;
  }, [arenaSize, obstacles]);

  // Initialize AI snakes
  const initAISnakes = useCallback(() => {
    const aiColors = ['#3b82f6', '#f59e0b', '#ef4444'];
    const startPositions = [
      { x: 5, y: 5, dir: { x: 1, y: 0 } },
      { x: arenaSize.width - 5, y: 5, dir: { x: -1, y: 0 } },
      { x: 5, y: arenaSize.height - 5, dir: { x: 0, y: -1 } }
    ];
    
    return startPositions.map((pos, idx) => ({
      id: `ai-${idx}`,
      body: [
        { x: pos.x, y: pos.y },
        { x: pos.x - pos.dir.x, y: pos.y - pos.dir.y },
        { x: pos.x - pos.dir.x * 2, y: pos.y - pos.dir.y * 2 }
      ],
      direction: pos.dir,
      color: aiColors[idx],
      alive: true,
      score: 0
    }));
  }, [arenaSize.width, arenaSize.height]);

  // Initialize game
  const initGame = useCallback(() => {
    const centerX = Math.floor(arenaSize.width / 2);
    const centerY = Math.floor(arenaSize.height / 2);
    
    setSnake([
      { x: centerX, y: centerY },
      { x: centerX - 1, y: centerY },
      { x: centerX - 2, y: centerY }
    ]);
    setDirection({ x: 1, y: 0 });
    setNextDirection({ x: 1, y: 0 });
    directionRef.current = { x: 1, y: 0 };
    setScore(0);
    setLevel(1);
    setSpeed(INITIAL_SPEED);
    setActivePowerUp(null);
    setCombo(0);
    setWinner(null);
    setGameRankings([]);
    
    // Generate obstacles based on game mode
    const newObstacles = [];
    if (gameMode === 'arena') {
      for (let x = 0; x < arenaSize.width; x++) {
        newObstacles.push({ x, y: 0 }, { x, y: arenaSize.height - 1 });
      }
      for (let y = 1; y < arenaSize.height - 1; y++) {
        newObstacles.push({ x: 0, y }, { x: arenaSize.width - 1, y });
      }
      for (let i = 0; i < 5 + level; i++) {
        newObstacles.push({
          x: Math.floor(Math.random() * (arenaSize.width - 4)) + 2,
          y: Math.floor(Math.random() * (arenaSize.height - 4)) + 2
        });
      }
    }
    setObstacles(newObstacles);
    
    // Initialize AI snakes for AI mode
    let initialAi = [];
    if (gameMode === 'ai') {
      initialAi = initAISnakes();
      setAiSnakes(initialAi);
      setAiScores({});
    } else {
      setAiSnakes([]);
    }
    
    // Initial food position
    const newSnake = [
      { x: centerX, y: centerY },
      { x: centerX - 1, y: centerY },
      { x: centerX - 2, y: centerY }
    ];
    const allBodies = [...newSnake, ...initialAi.flatMap(s => s.body)];
    setFood(getRandomPosition(allBodies, newObstacles, arenaSize.width, arenaSize.height));
    setPowerUp(null);
  }, [arenaSize, gameMode, level, initAISnakes]);

  // Start game
  const startGame = () => {
    initGame();
    setGameState('playing');
  };

  // Reset game
  const resetGame = () => {
    setGameState('menu');
    setDirection({ x: 0, y: 0 });
    setNextDirection({ x: 0, y: 0 });
    directionRef.current = { x: 0, y: 0 };
    setWinner(null);
    setGameRankings([]);
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
  };

  // Handle game over - supports both regular and AI mode
  const handleGameOver = (playerWon = false) => {
    playSound('die');
    
    if (gameMode === 'ai') {
      // Calculate rankings for AI mode
      const allPlayers = [
        { id: 'player', name: 'You', score: score, alive: !playerWon || gameState !== 'gameover', color: '#22c55e' },
        ...aiSnakes.map((ai, idx) => ({
          id: ai.id,
          name: `AI ${idx + 1}`,
          score: ai.score,
          alive: ai.alive,
          color: ai.color
        }))
      ];
      
      // Sort by score descending
      const sortedRankings = allPlayers.sort((a, b) => b.score - a.score);
      setGameRankings(sortedRankings);
      
      // Set winner
      if (playerWon || sortedRankings[0]?.id === 'player') {
        setWinner({ name: 'You', score: score });
      } else {
        setWinner(sortedRankings[0]);
      }
    }
    
    setGameState('gameover');
    
    // Update high score for regular mode
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('snakeHighScore', score);
    }
  };

  // Handle direction changes - immediate update with 180-degree turn prevention
  const changeDirection = useCallback((newDir) => {
    // Get current direction from ref for immediate comparison
    const currentDir = directionRef.current;
    
    // Prevent 180-degree turns
    if (newDir.x === -currentDir.x && newDir.y === -currentDir.y) {
      return;
    }
    
    // Prevent changing to same direction
    if (newDir.x === currentDir.x && newDir.y === currentDir.y) {
      return;
    }
    
    // Immediate update - no state batching delay
    directionRef.current = newDir;
    setDirection(newDir);
    setNextDirection(newDir);
  }, []);

  // Refs for immediate access in game loop
  const directionRef = useRef({ x: 0, y: 0 });
  const inputQueueRef = useRef([]);
  
  // Keep direction ref in sync
  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);

  // Game loop - uses refs for immediate input response
  useEffect(() => {
    if (gameState !== 'playing') return;

    let lastTime = performance.now();
    let accumulator = 0;
    
    const gameLoop = (currentTime) => {
      if (gameState !== 'playing') return;
      
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;
      accumulator += deltaTime;
      
      // Process at fixed interval based on speed
      if (accumulator >= speed) {
        accumulator = 0;
        
        // Use current direction from ref for immediate response
        const currentDir = directionRef.current;
        
        // Don't move if no direction set
        if (currentDir.x === 0 && currentDir.y === 0) {
          gameLoopRef.current = requestAnimationFrame(gameLoop);
          return;
        }
        
        setSnake(currentSnake => {
          const head = currentSnake[0];
          const newHead = {
            x: head.x + currentDir.x,
            y: head.y + currentDir.y
          };

          // Check wall collision (unless ghost mode)
          if (activePowerUp?.type !== 'ghost') {
            if (
              newHead.x < 0 || newHead.x >= arenaSize.width ||
              newHead.y < 0 || newHead.y >= arenaSize.height
            ) {
              playSound('die');
              setGameState('gameover');
              if (score > highScore) {
                setHighScore(score);
                localStorage.setItem('snakeHighScore', score);
              }
              return currentSnake;
            }
          } else {
            // Wrap around in ghost mode
            newHead.x = (newHead.x + arenaSize.width) % arenaSize.width;
            newHead.y = (newHead.y + arenaSize.height) % arenaSize.height;
          }

          // Check self collision (unless ghost mode)
          if (activePowerUp?.type !== 'ghost') {
            if (currentSnake.some((seg, idx) => idx > 0 && seg.x === newHead.x && seg.y === newHead.y)) {
              playSound('die');
              setGameState('gameover');
              if (score > highScore) {
                setHighScore(score);
                localStorage.setItem('snakeHighScore', score);
              }
              return currentSnake;
            }
          }

          // Check obstacle collision
          if (obstacles.some(o => o.x === newHead.x && o.y === newHead.y)) {
            playSound('die');
            handleGameOver();
            return currentSnake;
          }

          // Check collision with AI snakes
          if (gameMode === 'ai') {
            for (const ai of aiSnakes) {
              if (!ai.alive) continue;
              if (ai.body.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
                playSound('die');
                handleGameOver();
                return currentSnake;
              }
            }
          }

          const newSnake = [newHead, ...currentSnake];

          // Check food collision
          if (newHead.x === food.x && newHead.y === food.y) {
            const points = activePowerUp?.type === 'double' ? 20 : 10;
            const newScore = score + points + (combo * 5);
            setScore(newScore);
            setCombo(c => c + 1);
            playSound('eat');
            
            // Level up every 50 points
            const newLevel = Math.floor(newScore / 50) + 1;
            if (newLevel > level) {
              setLevel(newLevel);
              // Increase speed slightly
              setSpeed(s => Math.max(MIN_SPEED, s - 5));
            }
            
            // Spawn new food - avoid all snakes
            const allSnakeBodies = [...newSnake];
            aiSnakes.forEach(ai => {
              if (ai.alive) allSnakeBodies.push(...ai.body);
            });
            setFood(getRandomPosition(allSnakeBodies, obstacles, arenaSize.width, arenaSize.height));
            
            // Chance to spawn power-up
            if (Math.random() < 0.15 && !powerUp) {
              const types = Object.keys(POWERUPS);
              const randomType = types[Math.floor(Math.random() * types.length)];
              const pos = getRandomPosition(allSnakeBodies, [...obstacles, food], arenaSize.width, arenaSize.height);
              setPowerUp({ ...POWERUPS[randomType], x: pos.x, y: pos.y });
            }
          } else {
            newSnake.pop();
            setCombo(0);
          }

          // Check power-up collision
          if (powerUp && newHead.x === powerUp.x && newHead.y === powerUp.y) {
            playSound('powerup');
            setActivePowerUp(powerUp);
            setPowerUp(null);
            
            // Clear previous timer
            if (powerUpTimerRef.current) {
              clearTimeout(powerUpTimerRef.current);
            }
            
            // Apply power-up effects
            if (powerUp.type === 'speed') {
              setSpeed(MIN_SPEED);
            } else if (powerUp.type === 'slow') {
              setSpeed(INITIAL_SPEED + 50);
            }
            
            // Set expiration
            powerUpTimerRef.current = setTimeout(() => {
              setActivePowerUp(null);
              if (powerUp.type === 'speed' || powerUp.type === 'slow') {
                setSpeed(INITIAL_SPEED - (level - 1) * 5);
              }
            }, powerUp.duration);
          }

          return newSnake;
        });

        // Move AI snakes in AI mode
        if (gameMode === 'ai') {
          setAiSnakes(currentAiSnakes => {
            const updatedAiSnakes = currentAiSnakes.map(ai => {
              if (!ai.alive) return ai;
              
              // Get AI direction
              const playerSnake = snake;
              const allSnakes = [
                { id: 'player', body: playerSnake },
                ...currentAiSnakes.filter(a => a.id !== ai.id && a.alive).map(a => ({ id: a.id, body: a.body }))
              ];
              const aiDir = getAIdirection(ai, allSnakes, food);
              ai.direction = aiDir;
              
              const head = ai.body[0];
              const newHead = { x: head.x + aiDir.x, y: head.y + aiDir.y };
              
              // Check wall collision
              const isWall = newHead.x < 0 || newHead.x >= arenaSize.width || 
                           newHead.y < 0 || newHead.y >= arenaSize.height;
              
              // Check self collision
              const isSelf = ai.body.some((seg, idx) => idx > 0 && seg.x === newHead.x && seg.y === newHead.y);
              
              // Check obstacle collision
              const isObstacle = obstacles.some(o => o.x === newHead.x && o.y === newHead.y);
              
              // Check collision with player
              const isPlayer = playerSnake.some(seg => seg.x === newHead.x && seg.y === newHead.y);
              
              // Check collision with other AI snakes
              const isOtherAi = currentAiSnakes.some(other => 
                other.id !== ai.id && other.alive && other.body.some(seg => 
                  seg.x === newHead.x && seg.y === newHead.y
                )
              );
              
              if (isWall || isSelf || isObstacle || isPlayer || isOtherAi) {
                return { ...ai, alive: false };
              }
              
              const newBody = [newHead, ...ai.body];
              
              // Check food collision
              let ateFood = false;
              if (newHead.x === food.x && newHead.y === food.y) {
                ateFood = true;
                ai.score += 10;
              } else {
                newBody.pop();
              }
              
              return { ...ai, body: newBody, ateFood };
            });
            
            // Check if any AI ate food and respawn
            const anyAteFood = updatedAiSnakes.some(ai => ai.ateFood);
            if (anyAteFood) {
              const allBodies = [...snake];
              updatedAiSnakes.forEach(ai => {
                if (ai.alive) allBodies.push(...ai.body);
              });
              setFood(getRandomPosition(allBodies, obstacles, arenaSize.width, arenaSize.height));
            }
            
            // Check game end conditions for AI mode
            const aliveAi = updatedAiSnakes.filter(ai => ai.alive);
            if (aliveAi.length === 0 && gameMode === 'ai') {
              // Player wins!
              handleGameOver(true);
            }
            
            return updatedAiSnakes.map(ai => ({ ...ai, ateFood: false }));
          });
        }

        playSound('move');
      }
      
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameState, speed, food, powerUp, obstacles, score, level, highScore, arenaSize, activePowerUp, combo, gameMode, aiSnakes, snake, getAIdirection]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameState !== 'playing') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (gameState === 'menu' || gameState === 'gameover') {
            startGame();
          }
        }
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          changeDirection({ x: 0, y: -1 });
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          changeDirection({ x: 0, y: 1 });
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          changeDirection({ x: -1, y: 0 });
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          changeDirection({ x: 1, y: 0 });
          break;
        case ' ':
        case 'Escape':
          e.preventDefault();
          setGameState(prev => prev === 'playing' ? 'paused' : 'playing');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, changeDirection]);

  // Draw game
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = arenaSize.width * CELL_SIZE;
    const height = arenaSize.height * CELL_SIZE;
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= arenaSize.width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL_SIZE, 0);
      ctx.lineTo(x * CELL_SIZE, height);
      ctx.stroke();
    }
    for (let y = 0; y <= arenaSize.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL_SIZE);
      ctx.lineTo(width, y * CELL_SIZE);
      ctx.stroke();
    }

    // Draw obstacles
    ctx.fillStyle = '#374151';
    obstacles.forEach(obs => {
      ctx.fillRect(obs.x * CELL_SIZE, obs.y * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1);
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(obs.x * CELL_SIZE + 3, obs.y * CELL_SIZE + 3, CELL_SIZE - 7, CELL_SIZE - 7);
      ctx.fillStyle = '#374151';
    });

    // Draw food
    const foodX = food.x * CELL_SIZE + CELL_SIZE / 2;
    const foodY = food.y * CELL_SIZE + CELL_SIZE / 2;
    const pulse = Math.sin(Date.now() / 200) * 2;
    ctx.beginPath();
    ctx.arc(foodX, foodY, (CELL_SIZE / 2 - 3) + pulse, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(foodX, foodY, (CELL_SIZE / 2 - 6) + pulse, 0, Math.PI * 2);
    ctx.fillStyle = '#f87171';
    ctx.fill();

    // Draw power-up
    if (powerUp) {
      const puX = powerUp.x * CELL_SIZE + CELL_SIZE / 2;
      const puY = powerUp.y * CELL_SIZE + CELL_SIZE / 2;
      const puPulse = Math.sin(Date.now() / 150) * 3;
      ctx.beginPath();
      ctx.arc(puX, puY, (CELL_SIZE / 2 - 2) + puPulse, 0, Math.PI * 2);
      ctx.fillStyle = powerUp.color;
      ctx.fill();
      ctx.shadowColor = powerUp.color;
      ctx.shadowBlur = 10;
      ctx.fillText(powerUp.emoji, puX - 7, puY + 4);
      ctx.shadowBlur = 0;
    }

    // Draw player snake
    snake.forEach((seg, idx) => {
      const x = seg.x * CELL_SIZE;
      const y = seg.y * CELL_SIZE;
      
      // Ghost mode effect
      if (activePowerUp?.type === 'ghost') {
        ctx.globalAlpha = 0.6;
      }
      
      if (idx === 0) {
        // Head
        const gradient = ctx.createLinearGradient(x, y, x + CELL_SIZE, y + CELL_SIZE);
        gradient.addColorStop(0, activePowerUp ? '#22d3ee' : '#22c55e');
        gradient.addColorStop(1, activePowerUp ? '#06b6d4' : '#16a34a');
        ctx.fillStyle = gradient;
        ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        
        // Eyes
        ctx.fillStyle = 'white';
        const eyeSize = 4;
        if (direction.x === 1) {
          ctx.fillRect(x + CELL_SIZE - 8, y + 4, eyeSize, eyeSize);
          ctx.fillRect(x + CELL_SIZE - 8, y + CELL_SIZE - 8, eyeSize, eyeSize);
        } else if (direction.x === -1) {
          ctx.fillRect(x + 4, y + 4, eyeSize, eyeSize);
          ctx.fillRect(x + 4, y + CELL_SIZE - 8, eyeSize, eyeSize);
        } else if (direction.y === -1) {
          ctx.fillRect(x + 4, y + 4, eyeSize, eyeSize);
          ctx.fillRect(x + CELL_SIZE - 8, y + 4, eyeSize, eyeSize);
        } else {
          ctx.fillRect(x + 4, y + CELL_SIZE - 8, eyeSize, eyeSize);
          ctx.fillRect(x + CELL_SIZE - 8, y + CELL_SIZE - 8, eyeSize, eyeSize);
        }
      } else {
        // Body
        const bodyGradient = ctx.createLinearGradient(x, y, x + CELL_SIZE, y + CELL_SIZE);
        bodyGradient.addColorStop(0, activePowerUp ? '#67e8f9' : '#4ade80');
        bodyGradient.addColorStop(1, activePowerUp ? '#22d3ee' : '#22c55e');
        ctx.fillStyle = bodyGradient;
        const shrink = Math.min(idx * 0.5, 4);
        ctx.fillRect(x + 2 + shrink/2, y + 2 + shrink/2, CELL_SIZE - 4 - shrink, CELL_SIZE - 4 - shrink);
      }
      
      ctx.globalAlpha = 1;
    });

    // Draw AI snakes
    aiSnakes.forEach(ai => {
      if (!ai.alive) return;
      ai.body.forEach((seg, idx) => {
        const x = seg.x * CELL_SIZE;
        const y = seg.y * CELL_SIZE;
        
        if (idx === 0) {
          // AI Head
          ctx.fillStyle = ai.color;
          ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
          // Eyes
          ctx.fillStyle = 'white';
          const eyeSize = 3;
          const dir = ai.direction || { x: 1, y: 0 };
          if (dir.x === 1) {
            ctx.fillRect(x + CELL_SIZE - 6, y + 3, eyeSize, eyeSize);
            ctx.fillRect(x + CELL_SIZE - 6, y + CELL_SIZE - 6, eyeSize, eyeSize);
          } else if (dir.x === -1) {
            ctx.fillRect(x + 3, y + 3, eyeSize, eyeSize);
            ctx.fillRect(x + 3, y + CELL_SIZE - 6, eyeSize, eyeSize);
          } else if (dir.y === -1) {
            ctx.fillRect(x + 3, y + 3, eyeSize, eyeSize);
            ctx.fillRect(x + CELL_SIZE - 6, y + 3, eyeSize, eyeSize);
          } else {
            ctx.fillRect(x + 3, y + CELL_SIZE - 6, eyeSize, eyeSize);
            ctx.fillRect(x + CELL_SIZE - 6, y + CELL_SIZE - 6, eyeSize, eyeSize);
          }
        } else {
          // AI Body
          ctx.fillStyle = ai.color;
          ctx.globalAlpha = 0.7;
          ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
          ctx.globalAlpha = 1;
        }
      });
    });

  }, [snake, food, powerUp, obstacles, direction, arenaSize, activePowerUp, aiSnakes]);

  // Render
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-96 h-96 rounded-full bg-green-500/10 blur-3xl -top-20 -left-20 animate-pulse" />
        <div className="absolute w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl -bottom-20 -right-20 animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Header */}
      <div className="relative z-10 w-full max-w-2xl mb-4">
        <div className="flex items-center justify-between">
          <Link 
            to="/exclusive" 
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group"
          >
            <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="font-medium text-sm">{t('snakeArena.back')}</span>
          </Link>
          
          <div className="flex items-center gap-3">
            <span className="text-4xl">🐍</span>
            <div className="text-center">
              <h1 className="text-2xl font-black">{t('snakeArena.title')}</h1>
              <p className="text-xs text-zinc-500">GameHub Exclusive</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-xs text-zinc-500">{t('snakeArena.highScore')}</span>
              <span className="ml-2 font-bold text-yellow-400">{highScore}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Game Container */}
      <div className="relative z-10">
        {/* Stats Bar */}
        {gameState !== 'menu' && (
          <div className="flex items-center justify-between mb-3 px-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏆</span>
                <span className="font-bold text-xl">{score}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">📊</span>
                <span className="text-sm text-zinc-400">{t('snakeArena.level')} {level}</span>
              </div>
              {combo > 1 && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/20 border border-orange-500/30">
                  <span className="text-xs text-orange-400 font-bold">{combo}x Combo!</span>
                </div>
              )}
            </div>
            {activePowerUp && (
              <div 
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border animate-pulse"
                style={{ 
                  backgroundColor: `${activePowerUp.color}20`,
                  borderColor: `${activePowerUp.color}50`
                }}
              >
                <span>{activePowerUp.emoji}</span>
                <span className="text-xs font-bold" style={{ color: activePowerUp.color }}>
                  {activePowerUp.type.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Canvas Container */}
        <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/50 p-2 shadow-2xl">
          <canvas
            ref={canvasRef}
            className="block rounded-xl"
            style={{ imageRendering: 'pixelated' }}
          />

          {/* Overlays */}
          {gameState === 'menu' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 rounded-2xl">
              <span className="text-6xl mb-4">🐍</span>
              <h2 className="text-3xl font-black mb-2">{t('snakeArena.title')}</h2>
              <p className="text-zinc-400 mb-6 text-center max-w-xs">
                {t('snakeArena.subtitle')}
              </p>
              
              {/* Game Mode Selection */}
              <div className="flex gap-2 mb-6 flex-wrap justify-center">
                {['classic', 'arena', 'endless', 'ai'].map(mode => (
                  <button
                    key={mode}
                    onClick={() => setGameMode(mode)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold capitalize transition-all ${
                      gameMode === mode
                        ? 'bg-green-500 text-black'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {mode === 'ai' ? t('snakeArena.modes.ai') : t(`snakeArena.modes.${mode}`)}
                  </button>
                ))}
              </div>

              <button
                onClick={startGame}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-black font-bold hover:from-green-400 hover:to-emerald-400 transition-all shadow-lg shadow-green-500/20"
              >
                ▶ {t('snakeArena.play')}
              </button>
              
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setShowInstructions(true)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 transition-all"
                >
                  ❓ {t('snakeArena.instructions')}
                </button>
              </div>

              <div className="mt-6 text-xs text-zinc-500">
                {t('snakeArena.controls.move')}
              </div>
            </div>
          )}

          {gameState === 'paused' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 rounded-2xl">
              <span className="text-5xl mb-4">⏸️</span>
              <h2 className="text-2xl font-bold mb-4">{t('snakeArena.paused')}</h2>
              <button
                onClick={() => setGameState('playing')}
                className="px-6 py-2 rounded-xl bg-green-500 text-black font-bold hover:bg-green-400 transition-all"
              >
                {t('snakeArena.resume')}
              </button>
              <p className="mt-4 text-xs text-zinc-500">{t('snakeArena.pressSpace')}</p>
            </div>
          )}

          {gameState === 'gameover' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 rounded-2xl">
              <span className="text-6xl mb-4">💀</span>
              <h2 className="text-3xl font-black mb-2">{t('snakeArena.gameOver')}</h2>
              <div className="text-center mb-6">
                <p className="text-lg">
                  {t('snakeArena.score')}: <span className="font-bold text-yellow-400">{score}</span>
                </p>
                {score === highScore && score > 0 && (
                  <p className="text-sm text-green-400 mt-1">🎉 {t('snakeArena.newHighScore')}</p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={startGame}
                  className="px-6 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-black font-bold hover:from-green-400 hover:to-emerald-400 transition-all"
                >
                  🔄 {t('snakeArena.playAgain')}
                </button>
                <button
                  onClick={resetGame}
                  className="px-6 py-2 rounded-xl bg-zinc-800 text-zinc-300 font-bold hover:bg-zinc-700 transition-all"
                >
                  📋 {t('snakeArena.backToMenu')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controls Hint */}
        {gameState === 'playing' && (
          <div className="flex justify-center mt-4 gap-2 text-xs text-zinc-500">
            <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800">WASD / Arrows</span>
            <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800">Space: Pause</span>
          </div>
        )}
      </div>

      {/* Instructions Modal */}
      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="max-w-md w-full rounded-2xl border border-zinc-700 bg-zinc-900 p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span>📖</span> {t('snakeArena.instructions')}
            </h3>
            
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-bold text-zinc-300 mb-1">{t('snakeArena.controls.title')}</h4>
                <p className="text-zinc-400">{t('snakeArena.controls.move')}</p>
              </div>
              
              <div>
                <h4 className="font-bold text-zinc-300 mb-1">{t('snakeArena.howToPlay.goal')}</h4>
                <p className="text-zinc-400">{t('snakeArena.howToPlay.eat')}</p>
              </div>
              
              <div>
                <h4 className="font-bold text-zinc-300 mb-1">{t('snakeArena.powerups')}</h4>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="flex items-center gap-2 p-2 rounded bg-zinc-800">
                    <span>⚡</span>
                    <span className="text-xs">{t('snakeArena.powerup.speed')}</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded bg-zinc-800">
                    <span>🐌</span>
                    <span className="text-xs">{t('snakeArena.powerup.slow')}</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded bg-zinc-800">
                    <span>✨</span>
                    <span className="text-xs">{t('snakeArena.powerup.double')}</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded bg-zinc-800">
                    <span>👻</span>
                    <span className="text-xs">{t('snakeArena.powerup.ghost')}</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-bold text-zinc-300 mb-1">{t('snakeArena.modes.title')}</h4>
                <ul className="text-zinc-400 space-y-1">
                  <li>• <b>{t('snakeArena.modes.classic')}:</b> {t('snakeArena.modeDesc.classic')}</li>
                  <li>• <b>{t('snakeArena.modes.arena')}:</b> {t('snakeArena.modeDesc.arena')}</li>
                  <li>• <b>{t('snakeArena.modes.endless')}:</b> {t('snakeArena.modeDesc.endless')}</li>
                  <li>• <b>{t('snakeArena.modes.ai')}:</b> {t('snakeArena.modeDesc.ai')}</li>
                </ul>
              </div>
            </div>
            
            <button
              onClick={() => setShowInstructions(false)}
              className="w-full mt-6 py-2.5 rounded-xl bg-zinc-800 text-white font-bold hover:bg-zinc-700 transition-all"
            >
              {t('snakeArena.gotIt')}
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="relative z-10 mt-8 text-center">
        <p className="text-xs text-zinc-600">
          Snake Arena • GameHub Exclusive Collection
        </p>
      </div>
    </div>
  );
};

export default SnakeArena;
