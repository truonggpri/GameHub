// Pokemon data - 12 starter Pokemon with different types
export const POKEMON_DATA = [
  {
    id: 1,
    name: "Charmander",
    nameVi: "Rồng lửa",
    type: "fire",
    hp: 120,
    maxHp: 120,
    attack: 45,
    defense: 30,
    speed: 50,
    moves: [
      { name: "Cào", nameVi: "Cào", power: 35, accuracy: 95, type: "normal" },
      { name: "Lửa nhỏ", nameVi: "Lửa nhỏ", power: 50, accuracy: 90, type: "fire" },
      { name: "Phun lửa", nameVi: "Phun lửa", power: 70, accuracy: 85, type: "fire" },
      { name: "Tăng tốc", nameVi: "Tăng tốc", power: 0, accuracy: 100, type: "buff", effect: "speed" }
    ],
    color: "from-orange-500 to-red-600",
    emoji: "🔥"
  },
  {
    id: 2,
    name: "Squirtle",
    nameVi: "Rùa nước",
    type: "water",
    hp: 130,
    maxHp: 130,
    attack: 40,
    defense: 45,
    speed: 40,
    moves: [
      { name: "Đập", nameVi: "Đập", power: 35, accuracy: 95, type: "normal" },
      { name: "Súng nước", nameVi: "Súng nước", power: 50, accuracy: 90, type: "water" },
      { name: "Thủy kích", nameVi: "Thủy kích", power: 70, accuracy: 85, type: "water" },
      { name: "Rút vào mai", nameVi: "Rút vào mai", power: 0, accuracy: 100, type: "buff", effect: "defense" }
    ],
    color: "from-blue-400 to-blue-600",
    emoji: "💧"
  },
  {
    id: 3,
    name: "Bulbasaur",
    nameVi: "Khủng long cây",
    type: "grass",
    hp: 125,
    maxHp: 125,
    attack: 42,
    defense: 40,
    speed: 38,
    moves: [
      { name: "Cào", nameVi: "Cào", power: 35, accuracy: 95, type: "normal" },
      { name: "Lá cây", nameVi: "Lá cây", power: 50, accuracy: 90, type: "grass" },
      { name: "Dây leo", nameVi: "Dây leo", power: 65, accuracy: 85, type: "grass" },
      { name: "Hấp thụ", nameVi: "Hấp thụ", power: 30, accuracy: 100, type: "grass", effect: "heal" }
    ],
    color: "from-green-400 to-green-600",
    emoji: "🌿"
  },
  {
    id: 4,
    name: "Pikachu",
    nameVi: "Chuột điện",
    type: "electric",
    hp: 110,
    maxHp: 110,
    attack: 50,
    defense: 28,
    speed: 60,
    moves: [
      { name: "Cắn", nameVi: "Cắn", power: 35, accuracy: 95, type: "normal" },
      { name: "Sốc điện", nameVi: "Sốc điện", power: 55, accuracy: 90, type: "electric" },
      { name: "Volt tackle", nameVi: "Cú điện", power: 75, accuracy: 80, type: "electric" },
      { name: "Tăng tốc", nameVi: "Tăng tốc", power: 0, accuracy: 100, type: "buff", effect: "speed" }
    ],
    color: "from-yellow-400 to-yellow-600",
    emoji: "⚡"
  },
  {
    id: 5,
    name: "Geodude",
    nameVi: "Đá cuội",
    type: "rock",
    hp: 140,
    maxHp: 140,
    attack: 48,
    defense: 55,
    speed: 25,
    moves: [
      { name: "Ném đá", nameVi: "Ném đá", power: 40, accuracy: 90, type: "rock" },
      { name: "Lăn", nameVi: "Lăn", power: 55, accuracy: 85, type: "rock" },
      { name: "Đá lở", nameVi: "Đá lở", power: 75, accuracy: 80, type: "rock" },
      { name: "Cứng cỏi", nameVi: "Cứng cỏi", power: 0, accuracy: 100, type: "buff", effect: "defense" }
    ],
    color: "from-stone-500 to-stone-700",
    emoji: "🪨"
  },
  {
    id: 6,
    name: "Pidgey",
    nameVi: "Chim bồ câu",
    type: "flying",
    hp: 115,
    maxHp: 115,
    attack: 38,
    defense: 32,
    speed: 55,
    moves: [
      { name: "Mổ", nameVi: "Mổ", power: 40, accuracy: 95, type: "flying" },
      { name: "Gió xoáy", nameVi: "Gió xoáy", power: 50, accuracy: 90, type: "flying" },
      { name: "Lốc xoáy", nameVi: "Lốc xoáy", power: 70, accuracy: 85, type: "flying" },
      { name: "Lượn", nameVi: "Lượn", power: 0, accuracy: 100, type: "buff", effect: "speed" }
    ],
    color: "from-sky-400 to-sky-600",
    emoji: "🕊️"
  },
  {
    id: 7,
    name: "Machop",
    nameVi: "Võ sĩ",
    type: "fighting",
    hp: 135,
    maxHp: 135,
    attack: 55,
    defense: 35,
    speed: 35,
    moves: [
      { name: "Đấm", nameVi: "Đấm", power: 40, accuracy: 95, type: "fighting" },
      { name: "Cú đấm karate", nameVi: "Karate", power: 55, accuracy: 90, type: "fighting" },
      { name: "Cú đấm mạnh", nameVi: "Đấm mạnh", power: 80, accuracy: 75, type: "fighting" },
      { name: "Tập luyện", nameVi: "Tập luyện", power: 0, accuracy: 100, type: "buff", effect: "attack" }
    ],
    color: "from-rose-400 to-rose-600",
    emoji: "👊"
  },
  {
    id: 8,
    name: "Gastly",
    nameVi: "Ma khói",
    type: "ghost",
    hp: 105,
    maxHp: 105,
    attack: 52,
    defense: 25,
    speed: 58,
    moves: [
      { name: "Ám ảnh", nameVi: "Ám ảnh", power: 45, accuracy: 90, type: "ghost" },
      { name: "Bóng ma", nameVi: "Bóng ma", power: 60, accuracy: 85, type: "ghost" },
      { name: "Ác mộng", nameVi: "Ác mộng", power: 75, accuracy: 80, type: "ghost" },
      { name: "Biến mất", nameVi: "Biến mất", power: 0, accuracy: 100, type: "buff", effect: "speed" }
    ],
    color: "from-purple-500 to-purple-700",
    emoji: "👻"
  },
  {
    id: 9,
    name: "Eevee",
    nameVi: "Cáo linh",
    type: "normal",
    hp: 125,
    maxHp: 125,
    attack: 42,
    defense: 38,
    speed: 42,
    moves: [
      { name: "Cào", nameVi: "Cào", power: 35, accuracy: 95, type: "normal" },
      { name: "Cắn", nameVi: "Cắn", power: 50, accuracy: 90, type: "normal" },
      { name: "Siết cổ", nameVi: "Siết cổ", power: 70, accuracy: 80, type: "normal" },
      { name: "Kêu gọi", nameVi: "Kêu gọi", power: 0, accuracy: 100, type: "buff", effect: "all" }
    ],
    color: "from-amber-400 to-amber-600",
    emoji: "🦊"
  },
  {
    id: 10,
    name: "Jigglypuff",
    nameVi: "Bong bóng hồng",
    type: "fairy",
    hp: 150,
    maxHp: 150,
    attack: 35,
    defense: 25,
    speed: 30,
    moves: [
      { name: "Vỗ", nameVi: "Vỗ", power: 35, accuracy: 95, type: "fairy" },
      { name: "Hát ru", nameVi: "Hát ru", power: 50, accuracy: 90, type: "fairy" },
      { name: "Giấc mơ", nameVi: "Giấc mơ", power: 65, accuracy: 85, type: "fairy" },
      { name: "Hồi phục", nameVi: "Hồi phục", power: 40, accuracy: 100, type: "fairy", effect: "heal" }
    ],
    color: "from-pink-400 to-pink-600",
    emoji: "🎀"
  },
  {
    id: 11,
    name: "Meowth",
    nameVi: "Mèo tam thể",
    type: "normal",
    hp: 118,
    maxHp: 118,
    attack: 46,
    defense: 30,
    speed: 52,
    moves: [
      { name: "Cào", nameVi: "Cào", power: 35, accuracy: 95, type: "normal" },
      { name: "Cắn", nameVi: "Cắn", power: 45, accuracy: 90, type: "normal" },
      { name: "Móng vuốt", nameVi: "Móng vuốt", power: 65, accuracy: 85, type: "normal" },
      { name: "Tăng tốc", nameVi: "Tăng tốc", power: 0, accuracy: 100, type: "buff", effect: "speed" }
    ],
    color: "from-yellow-300 to-yellow-500",
    emoji: "🐱"
  },
  {
    id: 12,
    name: "Abra",
    nameVi: "Nhà ngoại cảm",
    type: "psychic",
    hp: 95,
    maxHp: 95,
    attack: 58,
    defense: 22,
    speed: 65,
    moves: [
      { name: "Dịch chuyển", nameVi: "Dịch chuyển", power: 45, accuracy: 90, type: "psychic" },
      { name: "Năng lượng", nameVi: "Năng lượng", power: 65, accuracy: 85, type: "psychic" },
      { name: "Tâm linh", nameVi: "Tâm linh", power: 80, accuracy: 75, type: "psychic" },
      { name: "Tập trung", nameVi: "Tập trung", power: 0, accuracy: 100, type: "buff", effect: "attack" }
    ],
    color: "from-violet-400 to-violet-600",
    emoji: "🔮"
  }
];

// Type effectiveness chart
export const TYPE_EFFECTIVENESS = {
  fire: { strong: ["grass", "ice", "bug", "steel"], weak: ["water", "rock", "ground", "fire"] },
  water: { strong: ["fire", "rock", "ground"], weak: ["grass", "electric", "water"] },
  grass: { strong: ["water", "rock", "ground"], weak: ["fire", "flying", "bug", "grass"] },
  electric: { strong: ["water", "flying"], weak: ["ground", "electric", "grass"] },
  rock: { strong: ["fire", "flying", "bug"], weak: ["water", "grass", "ground", "fighting"] },
  flying: { strong: ["grass", "fighting", "bug"], weak: ["electric", "rock", "ice"] },
  fighting: { strong: ["normal", "rock", "ice", "dark", "steel"], weak: ["flying", "psychic", "fairy", "fighting"] },
  ghost: { strong: ["ghost", "psychic"], weak: ["dark", "ghost"] },
  normal: { strong: [], weak: ["rock", "ghost", "steel"] },
  fairy: { strong: ["fighting", "dragon", "dark"], weak: ["poison", "steel", "fairy"] },
  psychic: { strong: ["fighting", "poison"], weak: ["bug", "ghost", "dark", "psychic"] }
};

export const TYPE_NAMES = {
  fire: { vi: "Lửa", color: "bg-orange-500" },
  water: { vi: "Nước", color: "bg-blue-500" },
  grass: { vi: "Cỏ", color: "bg-green-500" },
  electric: { vi: "Điện", color: "bg-yellow-500" },
  rock: { vi: "Đá", color: "bg-stone-500" },
  flying: { vi: "Bay", color: "bg-sky-500" },
  fighting: { vi: "Chiến", color: "bg-rose-500" },
  ghost: { vi: "Ma", color: "bg-purple-500" },
  normal: { vi: "Thường", color: "bg-gray-500" },
  fairy: { vi: "Tiên", color: "bg-pink-500" },
  psychic: { vi: "Tâm", color: "bg-violet-500" }
};

// Calculate damage with type effectiveness
export const calculateDamage = (move, attacker, defender) => {
  const basePower = move.power;
  const attackerAttack = attacker.attack;
  const defenderDefense = defender.defense;
  
  // Base damage formula
  let damage = Math.floor((basePower * attackerAttack / defenderDefense) * (0.8 + Math.random() * 0.4));
  
  // Ensure minimum damage of 1
  damage = Math.max(1, damage);
  
  // Type effectiveness
  const effectiveness = TYPE_EFFECTIVENESS[move.type];
  let multiplier = 1;
  
  // Only apply type effectiveness if the type exists in the chart
  if (effectiveness && effectiveness.strong && effectiveness.weak) {
    if (effectiveness.strong.includes(defender.type)) {
      multiplier = 2; // Super effective
    } else if (effectiveness.weak.includes(defender.type)) {
      multiplier = 0.5; // Not very effective
    }
  }
  
  // Same type attack bonus (STAB)
  if (move.type === attacker.type) {
    multiplier *= 1.25;
  }
  
  damage = Math.floor(damage * multiplier);
  
  return { damage, multiplier };
};

// Get AI move selection
export const getAIMove = (aiPokemon, playerPokemon) => {
  const moves = aiPokemon.moves;
  
  // Score each move
  const scoredMoves = moves.map(move => {
    let score = move.power;
    
    // Check type effectiveness (skip for buff moves and types not in chart)
    const effectiveness = TYPE_EFFECTIVENESS[move.type];
    if (effectiveness && effectiveness.strong && effectiveness.weak) {
      if (effectiveness.strong.includes(playerPokemon.type)) {
        score *= 1.5;
      } else if (effectiveness.weak.includes(playerPokemon.type)) {
        score *= 0.5;
      }
    }
    
    // Prefer STAB moves
    if (move.type === aiPokemon.type) {
      score *= 1.2;
    }
    
    // Buff moves have lower priority unless HP is high
    if (move.type === "buff") {
      if (aiPokemon.hp > aiPokemon.maxHp * 0.7) {
        score = 30; // Low priority when healthy
      } else {
        score = 80; // Higher priority when damaged
      }
    }
    
    // Heal moves priority when low HP
    if (move.effect === "heal" && aiPokemon.hp < aiPokemon.maxHp * 0.4) {
      score = 100;
    }
    
    return { move, score };
  });
  
  // Sort by score and pick from top 2 with some randomness
  scoredMoves.sort((a, b) => b.score - a.score);
  const topMoves = scoredMoves.slice(0, 2);
  return topMoves[Math.floor(Math.random() * topMoves.length)].move;
};
