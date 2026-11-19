// levels.js - thirty campaign operations, five visual theaters and endless waves.
// The first five layouts preserve the original missions. Later operations remix
// those arenas and increase the enemy mix so the campaign has a steady curve.

const CORNERS = [[40, 40], [920, 40], [40, 560], [920, 560], [480, 30]];

const MAP_TEMPLATES = [
  {
    ground: "#38433b", grid: "#424d42", wall: "#566252", top: "#849178",
    walls: [[150, 120, 140, 90], [670, 120, 140, 90], [150, 390, 140, 90], [670, 390, 140, 90], [400, 230, 160, 40], [420, 340, 120, 20]]
  },
  {
    ground: "#90784d", grid: "#a48a58", wall: "#705b3d", top: "#ae9060",
    walls: [[200, 200, 60, 60], [700, 300, 60, 60], [450, 120, 80, 50], [300, 420, 90, 40], [620, 440, 90, 40], [100, 330, 50, 100], [810, 150, 50, 100]]
  },
  {
    ground: "#303b3d", grid: "#3c4748", wall: "#566165", top: "#879397",
    walls: [[120, 100, 20, 200], [820, 100, 20, 200], [260, 260, 440, 24], [260, 430, 160, 24], [540, 430, 160, 24], [120, 400, 20, 150], [820, 400, 20, 150]]
  },
  {
    ground: "#344b31", grid: "#405a38", wall: "#554d35", top: "#72915a",
    walls: [[180, 150, 50, 50], [400, 90, 50, 50], [700, 180, 50, 50], [260, 380, 50, 50], [560, 330, 50, 50], [760, 440, 50, 50], [90, 300, 40, 40], [860, 330, 40, 40], [480, 200, 40, 40]]
  },
  {
    ground: "#4a3b32", grid: "#59473b", wall: "#765039", top: "#a16b48",
    walls: [[160, 160, 200, 30], [600, 160, 200, 30], [160, 420, 30, 100], [770, 420, 30, 100], [300, 300, 100, 100], [560, 300, 100, 100], [430, 120, 100, 30]]
  }
];

const OPERATION_NAMES = [
  "Rusted Outpost", "Dustline Convoy", "Cold Storage", "Timberline Run", "Ironworks Showdown",
  "Broken Perimeter", "Sand Viper", "Blacksite Entry", "Green Corridor", "Last Foundry",
  "Cinder Blockade", "Mirage Crossing", "Night Freight", "Canopy Ambush", "Redline Protocol",
  "Ghost Town Sweep", "Scorpion Ridge", "Deep Freight", "Overgrowth", "Steel Curtain",
  "Burnt Horizon", "Dry Riverbed", "Echo Warehouse", "Ranger's Path", "Dead Drop",
  "Borderfall", "The Long Watch", "Storm Cell", "Final Approach", "Operation Endgame"
];

function copyWalls(templateIndex, operationIndex) {
  const source = MAP_TEMPLATES[templateIndex].walls;
  const variant = Math.floor(operationIndex / 5);
  const walls = source.map(function (wall) {
    let x = wall[0];
    let y = wall[1];
    const width = wall[2];
    const height = wall[3];

    if (variant % 2 === 1) x = 960 - x - width;
    if (variant % 3 === 2) y = 600 - y - height;
    if (variant % 4 === 3) {
      const oldX = x;
      x = Math.max(55, Math.min(905 - width, y * 1.25));
      y = Math.max(55, Math.min(545 - height, oldX * 0.62));
    }
    return [Math.round(x), Math.round(y), width, height];
  });

  // Each five-mission block gets extra pieces of cover in a different area.
  if (operationIndex >= 5) {
    const additions = [
      [325, 115, 52, 28], [590, 355, 48, 34], [455, 470, 70, 24],
      [95, 215, 38, 55], [825, 365, 38, 55], [455, 270, 50, 30]
    ];
    const first = (variant * 2) % additions.length;
    walls.push(additions[first], additions[(first + 3) % additions.length]);
  }
  return walls;
}

function campaignWaves(levelNumber) {
  if (levelNumber === 1) return [{ basic: 10 }];
  if (levelNumber === 2) return [{ basic: 4 }, { basic: 4, fast: 2 }, { basic: 5, fast: 3 }];
  if (levelNumber === 3) return [{ basic: 12, fast: 6, sniper: 2 }];
  if (levelNumber === 4) return [{ basic: 4, heavy: 3 }, { basic: 3, heavy: 4, sniper: 2 }];
  if (levelNumber === 5) return [{ basic: 4, fast: 2 }, { boss: 1, basic: 4 }];

  const pressure = levelNumber - 5;
  const firstWave = {
    basic: 5 + Math.floor(pressure * 0.55),
    fast: Math.max(1, Math.floor(pressure / 4)),
    heavy: pressure >= 5 ? Math.floor(pressure / 7) : 0,
    sniper: pressure >= 8 ? Math.floor(pressure / 9) : 0
  };
  const secondWave = {
    basic: 4 + Math.floor(pressure * 0.62),
    fast: 1 + Math.floor(pressure / 4),
    heavy: pressure >= 3 ? 1 + Math.floor(pressure / 7) : 0,
    sniper: pressure >= 6 ? 1 + Math.floor(pressure / 9) : 0
  };

  if (levelNumber >= 10 && levelNumber % 5 === 0) secondWave.boss = levelNumber === 30 ? 2 : 1;
  if (levelNumber === 30) {
    firstWave.heavy += 2;
    secondWave.sniper += 2;
  }
  return [firstWave, secondWave];
}

function makeCampaignLevel(index) {
  const number = index + 1;
  const templateIndex = index % MAP_TEMPLATES.length;
  const template = MAP_TEMPLATES[templateIndex];
  const waves = campaignWaves(number);
  const enemyCount = waves.reduce(function (total, wave) {
    return total + Object.keys(wave).reduce(function (sum, key) { return sum + wave[key]; }, 0);
  }, 0);
  const difficulty = number <= 5 ? "ROOKIE" : number <= 12 ? "REGULAR" : number <= 21 ? "VETERAN" : "ELITE";

  return {
    number: number,
    name: OPERATION_NAMES[index],
    region: ["URBAN", "DESERT", "WAREHOUSE", "WOODLAND", "INDUSTRIAL"][templateIndex],
    objective: "Eliminate " + enemyCount + " hostiles across " + waves.length + " wave" + (waves.length > 1 ? "s" : ""),
    difficulty: difficulty,
    ground: template.ground,
    grid: template.grid,
    wall: template.wall,
    top: template.top,
    waves: waves,
    walls: copyWalls(templateIndex, index)
  };
}

const LEVELS = Array.from({ length: 30 }, function (_, index) {
  return makeCampaignLevel(index);
});

// Endless waves for Survival mode. Every fifth wave brings a boss.
function survivalWave(number) {
  return {
    basic: 4 + number,
    fast: number >= 2 ? number - 1 : 0,
    heavy: number >= 3 ? Math.floor(number / 3) : 0,
    sniper: number >= 4 ? Math.floor((number - 2) / 2) : 0,
    boss: number % 5 === 0 ? 1 : 0
  };
}
