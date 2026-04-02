import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

const CELL_SIZE = 20;
const ARENA_WIDTH = 25;
const ARENA_HEIGHT = 25;

const SnakeArenaMultiplayer = () => {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  
  // Game states
  const [gamePhase, setGamePhase] = useState('lobby'); // lobby, matchmaking, room, playing, ended
  const [roomId, setRoomId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
  // Game state
  const [snakes, setSnakes] = useState(new Map());
  const [food, setFood] = useState(null);
  const [scores, setScores] = useState({});
  const [gameMessage, setGameMessage] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [rankings, setRankings] = useState([]);
  
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const directionRef = useRef({ x: 0, y: 0 });

  // Initialize socket connection
  useEffect(() => {
    if (!token) return;

    const socketUrl = (import.meta.env.VITE_API_BASE_URL || '').replace('/api', '');
    const socketInstance = io(socketUrl, {
      transports: ['websocket', 'polling'],
      auth: { token }
    });

    socketRef.current = socketInstance;
    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      console.log('Connected to server');
      setConnectionStatus('connected');
      socketInstance.emit('authenticate', token);
    });

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnectionStatus('disconnected');
    });

    socketInstance.on('authenticated', (response) => {
      if (response.success) {
        console.log('Authenticated as', response.username);
      } else {
        console.error('Authentication failed');
      }
    });

    // Room events
    socketInstance.on('joinedRoom', (data) => {
      setRoomId(data.roomId);
      setPlayers(data.players);
      setIsHost(data.isHost);
      setGamePhase('room');
      setGameMessage('');
    });

    socketInstance.on('playerJoined', (data) => {
      setPlayers(prev => [...prev, data.player]);
    });

    socketInstance.on('playerLeft', (data) => {
      setPlayers(prev => prev.filter(p => p.id !== data.playerId));
      setGameMessage(`${data.username} left the room`);
    });

    socketInstance.on('playerReady', (data) => {
      setPlayers(prev => prev.map(p => 
        p.id === data.playerId ? { ...p, ready: true } : p
      ));
    });

    // Game events
    socketInstance.on('gameStarted', (data) => {
      setGamePhase('playing');
      setFood(data.food);
      
      const snakesMap = new Map();
      data.snakes.forEach(snake => {
        snakesMap.set(snake.playerId, snake);
      });
      setSnakes(snakesMap);
      
      setCountdown(3);
      const countdownInterval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });

    socketInstance.on('gameUpdate', (data) => {
      setSnakes(prev => {
        const newSnakes = new Map(prev);
        data.snakes.forEach(snake => {
          newSnakes.set(snake.playerId, snake);
        });
        return newSnakes;
      });
      
      if (data.food) {
        setFood(data.food);
      }
    });

    socketInstance.on('playerDied', (data) => {
      setPlayers(prev => prev.map(p => 
        p.id === data.playerId ? { ...p, alive: false } : p
      ));
      setGameMessage(`${data.username} died!`);
      
      setTimeout(() => setGameMessage(''), 2000);
    });

    socketInstance.on('gameEnded', (data) => {
      setGamePhase('ended');
      setRankings(data.rankings);
      if (data.winner) {
        setGameMessage(`${data.winner.username} wins!`);
      } else {
        setGameMessage(data.reason);
      }
    });

    socketInstance.on('error', (data) => {
      console.error('Server error:', data.message);
      setGameMessage(data.message);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [token]);

  // Keyboard controls
  useEffect(() => {
    if (gamePhase !== 'playing') return;

    const handleKeyDown = (e) => {
      let newDir = null;
      
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          newDir = { x: 0, y: -1 };
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          newDir = { x: 0, y: 1 };
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          newDir = { x: -1, y: 0 };
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          newDir = { x: 1, y: 0 };
          break;
        default:
          return;
      }

      if (newDir) {
        const currentDir = directionRef.current;
        // Prevent 180-degree turns
        if (newDir.x === -currentDir.x && newDir.y === -currentDir.y) {
          return;
        }
        directionRef.current = newDir;
        socketRef.current?.emit('playerMove', newDir);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gamePhase]);

  // Draw game
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = ARENA_WIDTH * CELL_SIZE;
    const height = ARENA_HEIGHT * CELL_SIZE;
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= ARENA_WIDTH; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL_SIZE, 0);
      ctx.lineTo(x * CELL_SIZE, height);
      ctx.stroke();
    }
    for (let y = 0; y <= ARENA_HEIGHT; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL_SIZE);
      ctx.lineTo(width, y * CELL_SIZE);
      ctx.stroke();
    }

    // Draw food
    if (food) {
      const foodX = food.x * CELL_SIZE + CELL_SIZE / 2;
      const foodY = food.y * CELL_SIZE + CELL_SIZE / 2;
      const pulse = Math.sin(Date.now() / 200) * 2;
      ctx.beginPath();
      ctx.arc(foodX, foodY, (CELL_SIZE / 2 - 3) + pulse, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
    }

    // Draw snakes
    snakes.forEach((snake, playerId) => {
      snake.body.forEach((seg, idx) => {
        const x = seg.x * CELL_SIZE;
        const y = seg.y * CELL_SIZE;
        
        if (idx === 0) {
          // Head
          ctx.fillStyle = snake.color;
          ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
          
          // Eyes
          ctx.fillStyle = 'white';
          const dir = snake.direction || { x: 1, y: 0 };
          const eyeSize = 3;
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
          // Body
          ctx.fillStyle = snake.color;
          ctx.globalAlpha = 0.8;
          ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
          ctx.globalAlpha = 1;
        }
      });
    });
  }, [snakes, food]);

  // Actions
  const quickMatch = () => {
    setGamePhase('matchmaking');
    setGameMessage('Finding a match...');
    socketRef.current?.emit('quickMatch');
  };

  const createRoom = () => {
    socketRef.current?.emit('createRoom', { private: false });
  };

  const joinRoom = (roomId) => {
    socketRef.current?.emit('joinRoom', roomId);
  };

  const toggleReady = () => {
    socketRef.current?.emit('playerReady');
    setIsReady(true);
  };

  const leaveRoom = () => {
    socketRef.current?.emit('leaveRoom');
    setGamePhase('lobby');
    setRoomId(null);
    setPlayers([]);
    setIsReady(false);
    setIsHost(false);
  };

  const playAgain = () => {
    setGamePhase('room');
    setIsReady(false);
    setSnakes(new Map());
    setFood(null);
    setRankings([]);
    setGameMessage('');
  };

  // Render
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-96 h-96 rounded-full bg-green-500/10 blur-3xl -top-20 -left-20 animate-pulse" />
        <div className="absolute w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl -bottom-20 -right-20 animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Header */}
      <div className="relative z-10 w-full max-w-4xl mb-6">
        <div className="flex items-center justify-between">
          <Link 
            to="/exclusive" 
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group"
          >
            <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="font-medium text-sm">Back</span>
          </Link>
          
          <div className="flex items-center gap-3">
            <span className="text-4xl">🐍</span>
            <div className="text-center">
              <h1 className="text-2xl font-black">Snake Arena</h1>
              <p className="text-xs text-zinc-500">Multiplayer</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-zinc-500 capitalize">{connectionStatus}</span>
          </div>
        </div>
      </div>

      {/* Lobby */}
      {gamePhase === 'lobby' && (
        <div className="relative z-10 text-center max-w-md">
          <span className="text-6xl mb-4 block">🐍</span>
          <h2 className="text-3xl font-black mb-4">Multiplayer Arena</h2>
          <p className="text-zinc-400 mb-8">
            Battle against other players in real-time! Eat food, grow your snake, and survive to win.
          </p>
          
          <div className="space-y-3">
            <button
              onClick={quickMatch}
              className="w-full px-8 py-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-black font-bold text-lg hover:from-green-400 hover:to-emerald-400 transition-all shadow-lg shadow-green-500/20"
            >
              ⚡ Quick Match
            </button>
            
            <div className="flex gap-3">
              <button
                onClick={createRoom}
                className="flex-1 px-6 py-3 rounded-xl bg-zinc-800 text-white font-bold hover:bg-zinc-700 transition-all"
              >
                🏠 Create Room
              </button>
            </div>
          </div>
          
          <div className="mt-8 text-xs text-zinc-600">
            Use WASD or Arrow Keys to move
          </div>
        </div>
      )}

      {/* Matchmaking */}
      {gamePhase === 'matchmaking' && (
        <div className="relative z-10 text-center">
          <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Finding Match...</h2>
          <p className="text-zinc-400 mb-6">Looking for other players</p>
          <button
            onClick={() => {
              setGamePhase('lobby');
              leaveRoom();
            }}
            className="px-6 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-all"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Room */}
      {gamePhase === 'room' && (
        <div className="relative z-10 w-full max-w-2xl">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold">Room: {roomId}</h2>
                <p className="text-sm text-zinc-500">{players.length}/4 players</p>
              </div>
              <button
                onClick={leaveRoom}
                className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-all text-sm"
              >
                Leave
              </button>
            </div>
            
            {/* Players List */}
            <div className="space-y-2 mb-6">
              {players.map(player => (
                <div 
                  key={player.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50"
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: player.color }}
                    />
                    <span className="font-medium">{player.username}</span>
                    {player.id === user?._id && (
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-700 text-zinc-400">You</span>
                    )}
                    {isHost && player.id === user?._id && (
                      <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Host</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {player.ready ? (
                      <span className="text-green-400 text-sm">✓ Ready</span>
                    ) : (
                      <span className="text-zinc-500 text-sm">Waiting...</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Ready Button */}
            <button
              onClick={toggleReady}
              disabled={isReady || players.length < 2}
              className={`w-full py-3 rounded-xl font-bold transition-all ${
                isReady
                  ? 'bg-green-500/20 text-green-400 cursor-default'
                  : players.length < 2
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-green-500 text-black hover:bg-green-400'
              }`}
            >
              {isReady ? '✓ Ready!' : players.length < 2 ? 'Need 2+ players' : 'I\'m Ready!'}
            </button>
          </div>
        </div>
      )}

      {/* Playing */}
      {(gamePhase === 'playing' || gamePhase === 'ended') && (
        <div className="relative z-10 w-full max-w-4xl">
          {/* Game Info */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              {players.map(player => (
                <div 
                  key={player.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
                    player.alive === false ? 'opacity-50' : ''
                  }`}
                  style={{ 
                    backgroundColor: `${player.color}20`,
                    borderColor: `${player.color}40`
                  }}
                >
                  <div 
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: player.color }}
                  />
                  <span className="text-sm font-medium">{player.username}</span>
                  <span className="text-xs text-zinc-400">{scores[player.id] || 0}</span>
                </div>
              ))}
            </div>
            
            <button
              onClick={leaveRoom}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-all text-sm"
            >
              Leave Game
            </button>
          </div>
          
          {/* Canvas */}
          <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/50 p-2">
            <canvas
              ref={canvasRef}
              className="block rounded-xl"
              style={{ imageRendering: 'pixelated' }}
            />
            
            {/* Countdown Overlay */}
            {countdown > 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl">
                <span className="text-6xl font-black">{countdown}</span>
              </div>
            )}
            
            {/* Game Message */}
            {gameMessage && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/70 text-white font-medium">
                {gameMessage}
              </div>
            )}
            
            {/* Game Over Overlay */}
            {gamePhase === 'ended' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 rounded-2xl">
                <h2 className="text-3xl font-black mb-4">Game Over!</h2>
                
                {/* Rankings */}
                <div className="w-full max-w-xs mb-6">
                  <h3 className="text-sm text-zinc-500 mb-2 text-center">Final Rankings</h3>
                  {rankings.map((player, idx) => (
                    <div 
                      key={player.id}
                      className={`flex items-center justify-between p-3 rounded-xl mb-2 ${
                        idx === 0 ? 'bg-yellow-500/20 border border-yellow-500/30' : 'bg-zinc-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold w-6">{idx + 1}</span>
                        <span className="font-medium">{player.username}</span>
                      </div>
                      <span className="font-bold">{player.score}</span>
                    </div>
                  ))}
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={playAgain}
                    className="px-6 py-2 rounded-xl bg-green-500 text-black font-bold hover:bg-green-400 transition-all"
                  >
                    Play Again
                  </button>
                  <button
                    onClick={() => {
                      setGamePhase('lobby');
                      leaveRoom();
                    }}
                    className="px-6 py-2 rounded-xl bg-zinc-800 text-zinc-300 font-bold hover:bg-zinc-700 transition-all"
                  >
                    Lobby
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex justify-center mt-4 gap-2 text-xs text-zinc-500">
            <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800">WASD / Arrows</span>
            <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800">Avoid walls & snakes</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SnakeArenaMultiplayer;
