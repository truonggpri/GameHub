const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

// Snake Arena Game Server
class SnakeArenaServer {
  constructor(httpServer, corsOptions) {
    this.io = new Server(httpServer, {
      cors: corsOptions,
      transports: ['websocket', 'polling']
    });

    // Game rooms storage
    this.rooms = new Map();
    this.players = new Map();
    this.matchmakingQueue = [];

    // Game constants
    this.ARENA_WIDTH = 25;
    this.ARENA_HEIGHT = 25;
    this.MAX_PLAYERS_PER_ROOM = 4;
    this.GAME_SPEED = 100;

    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log('Player connected:', socket.id);

      // Authenticate player
      socket.on('authenticate', (token) => {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          socket.userId = decoded.id;
          socket.username = decoded.username;
          socket.authenticated = true;
          socket.emit('authenticated', { success: true, username: decoded.username });
        } catch (err) {
          socket.authenticated = false;
          socket.emit('authenticated', { success: false, error: 'Invalid token' });
        }
      });

      // Quick match - find or create room
      socket.on('quickMatch', () => {
        if (!socket.authenticated) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        // Check if player already in a room
        const existingRoom = this.findPlayerRoom(socket.userId);
        if (existingRoom) {
          socket.emit('alreadyInRoom', { roomId: existingRoom.id });
          return;
        }

        // Try to join existing room with space
        const availableRoom = this.findAvailableRoom();
        if (availableRoom) {
          this.joinRoom(socket, availableRoom.id);
        } else {
          // Create new room
          const newRoom = this.createRoom();
          this.joinRoom(socket, newRoom.id);
        }
      });

      // Create private room
      socket.on('createRoom', (data = {}) => {
        if (!socket.authenticated) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const existingRoom = this.findPlayerRoom(socket.userId);
        if (existingRoom) {
          socket.emit('error', { message: 'Already in a room' });
          return;
        }

        const room = this.createRoom({ private: data.private || false });
        this.joinRoom(socket, room.id);
      });

      // Join room by ID
      socket.on('joinRoom', (roomId) => {
        if (!socket.authenticated) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const room = this.rooms.get(roomId);
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        if (room.players.length >= this.MAX_PLAYERS_PER_ROOM) {
          socket.emit('error', { message: 'Room is full' });
          return;
        }

        if (room.gameState === 'playing') {
          socket.emit('error', { message: 'Game already in progress' });
          return;
        }

        this.joinRoom(socket, roomId);
      });

      // Player ready
      socket.on('playerReady', () => {
        const room = this.findPlayerRoom(socket.userId);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.userId);
        if (player) {
          player.ready = true;
          this.io.to(room.id).emit('playerReady', { playerId: socket.userId, username: socket.username });
          
          // Check if all players ready (min 2 players)
          const readyCount = room.players.filter(p => p.ready).length;
          const allReady = readyCount === room.players.length && readyCount >= 2;
          
          if (allReady) {
            this.startGame(room);
          }
        }
      });

      // Player move
      socket.on('playerMove', (direction) => {
        const room = this.findPlayerRoom(socket.userId);
        if (!room || room.gameState !== 'playing') return;

        const snake = room.snakes.get(socket.userId);
        if (!snake) return;

        // Validate direction (prevent 180-degree turns)
        const currentDir = snake.direction;
        if (direction.x === -currentDir.x && direction.y === -currentDir.y) {
          return;
        }

        snake.nextDirection = direction;
      });

      // Leave room
      socket.on('leaveRoom', () => {
        this.leaveRoom(socket);
      });

      // Disconnect
      socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        this.leaveRoom(socket);
      });
    });
  }

  createRoom(options = {}) {
    const roomId = this.generateRoomId();
    const room = {
      id: roomId,
      players: [],
      snakes: new Map(),
      food: null,
      powerUps: [],
      gameState: 'waiting', // waiting, playing, ended
      gameLoop: null,
      gameSpeed: this.GAME_SPEED,
      createdAt: Date.now(),
      private: options.private || false
    };
    this.rooms.set(roomId, room);
    return room;
  }

  joinRoom(socket, roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Leave current room if any
    this.leaveRoom(socket);

    // Assign color to player
    const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'];
    const color = colors[room.players.length % colors.length];

    const player = {
      id: socket.userId,
      username: socket.username,
      socketId: socket.id,
      ready: false,
      color: color,
      score: 0,
      alive: true
    };

    room.players.push(player);
    socket.join(roomId);
    socket.currentRoom = roomId;

    // Notify player joined
    socket.emit('joinedRoom', {
      roomId: room.id,
      player: player,
      players: room.players,
      isHost: room.players.length === 1
    });

    // Notify other players
    socket.to(roomId).emit('playerJoined', { player: player });

    console.log(`Player ${socket.username} joined room ${roomId}`);
  }

  leaveRoom(socket) {
    const roomId = socket.currentRoom;
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    // Remove player from room
    const playerIndex = room.players.findIndex(p => p.id === socket.userId);
    if (playerIndex !== -1) {
      const player = room.players[playerIndex];
      room.players.splice(playerIndex, 1);

      // Remove snake if game is running
      if (room.snakes.has(socket.userId)) {
        room.snakes.delete(socket.userId);
      }

      // Notify other players
      socket.to(roomId).emit('playerLeft', { playerId: socket.userId, username: player.username });
      socket.leave(roomId);
      socket.currentRoom = null;

      console.log(`Player ${player.username} left room ${roomId}`);

      // End game if less than 2 players
      if (room.gameState === 'playing' && room.players.length < 2) {
        this.endGame(room, 'Not enough players');
      }

      // Delete room if empty
      if (room.players.length === 0) {
        if (room.gameLoop) {
          clearInterval(room.gameLoop);
        }
        this.rooms.delete(roomId);
        console.log(`Room ${roomId} deleted`);
      }
    }
  }

  findAvailableRoom() {
    for (const room of this.rooms.values()) {
      if (room.players.length < this.MAX_PLAYERS_PER_ROOM && room.gameState === 'waiting' && !room.private) {
        return room;
      }
    }
    return null;
  }

  findPlayerRoom(userId) {
    for (const room of this.rooms.values()) {
      if (room.players.some(p => p.id === userId)) {
        return room;
      }
    }
    return null;
  }

  startGame(room) {
    if (room.gameState === 'playing') return;

    room.gameState = 'playing';
    
    // Initialize snakes for each player
    room.players.forEach((player, index) => {
      const startPositions = [
        { x: 5, y: 5 },
        { x: 20, y: 5 },
        { x: 5, y: 20 },
        { x: 20, y: 20 }
      ];
      
      const startPos = startPositions[index % startPositions.length];
      const directions = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 }
      ];

      room.snakes.set(player.id, {
        body: [
          startPos,
          { x: startPos.x - directions[index].x, y: startPos.y - directions[index].y },
          { x: startPos.x - directions[index].x * 2, y: startPos.y - directions[index].y * 2 }
        ],
        direction: directions[index],
        nextDirection: directions[index],
        color: player.color,
        alive: true
      });
    });

    // Spawn initial food
    room.food = this.spawnFood(room);

    // Notify game started
    this.io.to(room.id).emit('gameStarted', {
      snakes: Array.from(room.snakes.entries()).map(([id, snake]) => ({
        playerId: id,
        body: snake.body,
        color: snake.color
      })),
      food: room.food
    });

    // Start game loop
    room.gameLoop = setInterval(() => this.gameTick(room), room.gameSpeed);

    console.log(`Game started in room ${room.id}`);
  }

  gameTick(room) {
    if (room.gameState !== 'playing') return;

    const updates = {
      snakes: [],
      eatenFood: false,
      collisions: [],
      powerUpsCollected: []
    };

    // Move all snakes
    for (const [playerId, snake] of room.snakes) {
      if (!snake.alive) continue;

      // Update direction
      snake.direction = snake.nextDirection;

      const head = snake.body[0];
      const newHead = {
        x: head.x + snake.direction.x,
        y: head.y + snake.direction.y
      };

      // Check wall collision
      if (
        newHead.x < 0 || newHead.x >= this.ARENA_WIDTH ||
        newHead.y < 0 || newHead.y >= this.ARENA_HEIGHT
      ) {
        snake.alive = false;
        updates.collisions.push({ playerId, type: 'wall' });
        this.playerDied(room, playerId);
        continue;
      }

      // Check self collision
      if (snake.body.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
        snake.alive = false;
        updates.collisions.push({ playerId, type: 'self' });
        this.playerDied(room, playerId);
        continue;
      }

      // Check collision with other snakes
      let collided = false;
      for (const [otherId, otherSnake] of room.snakes) {
        if (otherId === playerId || !otherSnake.alive) continue;
        
        if (otherSnake.body.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
          snake.alive = false;
          updates.collisions.push({ playerId, type: 'snake', with: otherId });
          this.playerDied(room, playerId);
          collided = true;
          break;
        }
      }
      
      if (collided) continue;

      // Move snake
      snake.body.unshift(newHead);

      // Check food collision
      if (room.food && newHead.x === room.food.x && newHead.y === room.food.y) {
        updates.eatenFood = true;
        const player = room.players.find(p => p.id === playerId);
        if (player) {
          player.score += 10;
        }
        // Don't pop tail - snake grows
      } else {
        snake.body.pop();
      }

      updates.snakes.push({
        playerId,
        body: snake.body,
        alive: snake.alive
      });
    }

    // Respawn food if eaten
    if (updates.eatenFood) {
      room.food = this.spawnFood(room);
      updates.food = room.food;
    }

    // Check game end
    const aliveSnakes = Array.from(room.snakes.values()).filter(s => s.alive);
    if (aliveSnakes.length <= 1 && room.players.length > 1) {
      const winner = aliveSnakes[0];
      const winnerId = winner ? Array.from(room.snakes.entries()).find(([id, s]) => s === winner)?.[0] : null;
      this.endGame(room, 'Game Over', winnerId);
      return;
    }

    // Broadcast updates
    this.io.to(room.id).emit('gameUpdate', updates);
  }

  playerDied(room, playerId) {
    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.alive = false;
      this.io.to(room.id).emit('playerDied', { playerId, username: player.username });
    }
  }

  endGame(room, reason, winnerId = null) {
    if (room.gameState === 'ended') return;

    room.gameState = 'ended';
    if (room.gameLoop) {
      clearInterval(room.gameLoop);
      room.gameLoop = null;
    }

    const winner = room.players.find(p => p.id === winnerId);
    
    // Sort by score
    const rankings = [...room.players].sort((a, b) => b.score - a.score);

    this.io.to(room.id).emit('gameEnded', {
      reason,
      winner: winner ? { id: winner.id, username: winner.username, score: winner.score } : null,
      rankings: rankings.map(p => ({ id: p.id, username: p.username, score: p.score }))
    });

    console.log(`Game ended in room ${room.id}. Winner: ${winner?.username || 'None'}`);
  }

  spawnFood(room) {
    const occupied = new Set();
    
    // Mark occupied positions
    for (const snake of room.snakes.values()) {
      for (const seg of snake.body) {
        occupied.add(`${seg.x},${seg.y}`);
      }
    }

    let food;
    let attempts = 0;
    do {
      food = {
        x: Math.floor(Math.random() * this.ARENA_WIDTH),
        y: Math.floor(Math.random() * this.ARENA_HEIGHT)
      };
      attempts++;
    } while (occupied.has(`${food.x},${food.y}`) && attempts < 100);

    return food;
  }

  generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // Admin endpoints
  getStats() {
    return {
      totalRooms: this.rooms.size,
      totalPlayers: Array.from(this.rooms.values()).reduce((sum, r) => sum + r.players.length, 0),
      waitingRooms: Array.from(this.rooms.values()).filter(r => r.gameState === 'waiting').length,
      activeGames: Array.from(this.rooms.values()).filter(r => r.gameState === 'playing').length
    };
  }

  getRooms() {
    return Array.from(this.rooms.values()).map(room => ({
      id: room.id,
      playerCount: room.players.length,
      maxPlayers: this.MAX_PLAYERS_PER_ROOM,
      gameState: room.gameState,
      private: room.private,
      players: room.players.map(p => ({ id: p.id, username: p.username, ready: p.ready }))
    }));
  }
}

module.exports = SnakeArenaServer;
