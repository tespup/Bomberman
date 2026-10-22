import { RNG, levelSeed, versusSeed, hash2d } from "../core/rng.js";
import { clamp, shuffle } from "../core/utils.js";
import {
  ARENA_COLS,
  ARENA_ROWS,
  TILE,
  ENEMY_LIST,
  POWERUPS,
  POWERUP_WEIGHTS,
  POWERUP_UNLOCK_LEVEL,
  MOUNT_LIST,
  TOTAL_LEVELS
} from "./catalog.js";
import { createPalette, getThemeForLevel } from "./palette.js";

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

const keyOf = (x, y) => `${x},${y}`;
const manhattan = (a, b) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);

export class LevelGenerator {
  constructor(cols = ARENA_COLS, rows = ARENA_ROWS) {
    this.cols = cols;
    this.rows = rows;
  }

  generate(level, options = {}) {
    const number = clamp(Number(level) || 1, 1, TOTAL_LEVELS);
    const seed = options.seed ?? levelSeed(number, 1);
    const rng = new RNG(seed);
    // The world name and palette are tied to the level number so the campaign
    // has a memorable identity. Layout, enemies and loot are re-rolled for
    // every attempt via the caller-provided seed.
    const palette = createPalette(number, options.paletteSeed);
    const versus = Boolean(options.versus);
    const levelData = {
      number,
      seed,
      cols: this.cols,
      rows: this.rows,
      palette,
      theme: getThemeForLevel(number).theme,
      name: palette.name,
      description: palette.description,
      versus,
      tiles: new Uint8Array(this.cols * this.rows),
      tileSeeds: new Uint32Array(this.cols * this.rows),
      spawns: [],
      exit: null,
      enemies: [],
      pickups: [],
      hiddenPickups: [],
      mountEgg: null,
      decorSeed: Math.floor(rng.next() * 2 ** 31),
      music: {
        root: 36 + (number * 7 + Math.floor(rng.float(0, 5))) % 14,
        tempo: Math.round(88 + (number % 9) * 3 + rng.float(-3, 4)),
        mode: (number + Math.floor(rng.float(0, 3))) % 4,
        seed: seed ^ 0x51f15e
      },
      difficulty: 1 + Math.min(0.24, (number - 1) * 0.0055),
      safeTiles: new Set(),
      parTime: 40 + number * 1.35,
      enemyCount: 0,
      softCount: 0
    };

    if (versus) return this.#generateVersus(levelData, rng, options);
    return this.#generateCampaign(levelData, rng);
  }

  #generateCampaign(level, rng) {
    const { cols, rows, tiles } = level;
    this.#initTiles(tiles, cols, rows);

    const spawn = { col: 1, row: 1 };
    level.spawns = [spawn];
    this.#clearArea(tiles, cols, rows, spawn.col, spawn.row, 2);

    const pattern = (level.number - 1) % 8;
    this.#carveHardLayout(level, rng, pattern);
    this.#clearArea(tiles, cols, rows, spawn.col, spawn.row, 2);

    // Pick the exit before soft blocks. Find a far, reachable floor cell.
    this.#ensureConnectivity(level);
    const exitCandidate = this.#pickExit(level, spawn, rng);
    level.exit = exitCandidate;
    this.#clearArea(tiles, cols, rows, exitCandidate.col, exitCandidate.row, 1);

    // A soft density curve that ramps up, then gently varies near the end.
    const density = clamp(0.3 + level.number * 0.0052 + rng.float(-0.045, 0.04), 0.28, 0.57);
    const reserved = new Set();
    this.#reserveCircle(reserved, cols, rows, spawn.col, spawn.row, 2);
    this.#reserveCircle(reserved, cols, rows, exitCandidate.col, exitCandidate.row, 1);

    const enemyCount = Math.min(11, 3 + Math.floor(level.number * 0.165) + (level.number % 10 === 0 ? 1 : 0));
    level.enemyCount = enemyCount;
    const enemyRoster = this.#selectEnemies(level.number, enemyCount, rng);
    const enemySpots = this.#pickEnemySpots(level, spawn, enemyRoster.length, rng);
    enemyRoster.forEach((type, index) => {
      const spot = enemySpots[index];
      if (!spot) return;
      level.enemies.push({
        type,
        col: spot.col,
        row: spot.row,
        seed: Math.floor(rng.next() * 2 ** 31),
        variant: rng.int(0, 3)
      });
      reserved.add(keyOf(spot.col, spot.row));
    });

    // A mount appears at predictable milestones and sometimes by chance.
    const mountAvailable = level.number >= 4 && (level.number % 4 === 0 || rng.chance(0.17));
    if (mountAvailable) {
      const spot = this.#pickOpenSpot(level, 4, rng, { avoid: spawn, reserved, nearExit: 2 });
      if (spot) {
        const mount = rng.pick(MOUNT_LIST);
        level.mountEgg = { type: mount.key, col: spot.col, row: spot.row, seed: Math.floor(rng.next() * 1e9) };
        reserved.add(keyOf(spot.col, spot.row));
      }
    }

    // Soft blocks.
    for (let row = 1; row < rows - 1; row += 1) {
      for (let col = 1; col < cols - 1; col += 1) {
        if (tiles[row * cols + col] !== TILE.FLOOR) continue;
        if (reserved.has(keyOf(col, row))) continue;
        if (rng.chance(density)) {
          tiles[row * cols + col] = TILE.BLOCK;
          level.softCount += 1;
        }
      }
    }

    // Make sure the exit has a breathable landing area.
    this.#clearArea(tiles, cols, rows, exitCandidate.col, exitCandidate.row, 1, true);

    // Visible starter upgrade on a nearby floor tile + hidden rewards.
    const visible = this.#pickPowerupSpot(level, spawn, rng, 3, 7);
    const focusType = this.#pickLevelFocus(level.number, rng);
    if (visible) {
      level.pickups.push({
        type: focusType,
        col: visible.col,
        row: visible.row,
        seed: Math.floor(rng.next() * 1e9),
        revealed: true,
        source: "floor"
      });
      reserved.add(keyOf(visible.col, visible.row));
    }

    const hiddenCount = 4 + Math.floor(level.number / 7) + rng.int(0, 2);
    const hiddenSpots = this.#allBlocks(level.tiles, cols, rows);
    const hiddenTypes = this.#selectPowerups(level.number, hiddenCount, rng, focusType);
    for (let i = 0; i < hiddenTypes.length && hiddenSpots.length; i += 1) {
      const index = Math.floor(rng.next() * hiddenSpots.length);
      const [spot] = hiddenSpots.splice(index, 1);
      level.hiddenPickups.push({
        type: hiddenTypes[i],
        col: spot.col,
        row: spot.row,
        seed: Math.floor(rng.next() * 1e9)
      });
    }

    this.#stampTileSeeds(level, rng);

    const introEnemy = ENEMY_LIST.find((enemy) => enemy.unlock === level.number);
    level.introEnemy = introEnemy?.key || null;
    level.introEnemyName = introEnemy?.name || null;
    level.roster = [...new Set(level.enemies.map((enemy) => enemy.type))];
    return level;
  }

  #generateVersus(level, rng, options) {
    const { cols, rows, tiles } = level;
    this.#initTiles(tiles, cols, rows);
    const spawns = [
      { col: 1, row: 1 },
      { col: cols - 2, row: rows - 2 }
    ];
    level.spawns = spawns;
    spawns.forEach((spawn) => this.#clearArea(tiles, cols, rows, spawn.col, spawn.row, 2));

    // Symmetric pillars, a central arena and decorative side pockets.
    const midX = (cols - 1) / 2;
    const midY = (rows - 1) / 2;
    for (let row = 1; row < rows - 1; row += 1) {
      for (let col = 1; col < cols - 1; col += 1) {
        if (col > midX && row > midY) continue;
        const edge = row === 3 || row === rows - 4 || col === 3 || col === cols - 4;
        const centerChance = Math.abs(col - midX) < 2 && Math.abs(row - midY) < 2;
        let isWall = false;
        if (centerChance && rng.chance(0.32)) isWall = true;
        else if (edge && rng.chance(0.18)) isWall = true;
        else if (rng.chance(0.06)) isWall = true;
        if (!isWall) continue;
        const mx = cols - 1 - col;
        const my = rows - 1 - row;
        tiles[row * cols + col] = TILE.WALL;
        if (mx > 0 && mx < cols - 1 && my > 0 && my < rows - 1) tiles[my * cols + mx] = TILE.WALL;
      }
    }
    spawns.forEach((spawn) => this.#clearArea(tiles, cols, rows, spawn.col, spawn.row, 2));
    // A guaranteed open duel lane through the middle.
    for (let col = 1; col < cols - 1; col += 1) tiles[Math.floor(midY) * cols + col] = TILE.FLOOR;
    for (let row = 1; row < rows - 1; row += 1) tiles[row * cols + Math.floor(midX)] = TILE.FLOOR;
    this.#ensureConnectivity(level);

    const reserved = new Set();
    spawns.forEach((spawn) => this.#reserveCircle(reserved, cols, rows, spawn.col, spawn.row, 2));

    // Mirrored soft blocks.
    for (let row = 1; row < rows - 1; row += 1) {
      for (let col = 1; col < cols - 1; col += 1) {
        if (col > midX && row > midY) continue;
        if (tiles[row * cols + col] !== TILE.FLOOR) continue;
        if (reserved.has(keyOf(col, row))) continue;
        if (!rng.chance(0.34)) continue;
        const mx = cols - 1 - col;
        const my = rows - 1 - row;
        if (mx <= 0 || mx >= cols - 1 || my <= 0 || my >= rows - 1) continue;
        if (tiles[my * cols + mx] !== TILE.FLOOR) continue;
        tiles[row * cols + col] = TILE.BLOCK;
        tiles[my * cols + mx] = TILE.BLOCK;
        level.softCount += 2;
      }
    }

    // Equal, mirrored pickup pairs ensure a fair duel.
    const blocks = this.#allBlocks(tiles, cols, rows);
    const types = ["range", "bomb", "speed", "armor", "kick", "detonator", "throw", "proximity", "immunity", "wallpass"];
    const pairCount = 5;
    for (let i = 0; i < pairCount && blocks.length; i += 1) {
      const index = Math.floor(rng.next() * blocks.length);
      const [spot] = blocks.splice(index, 1);
      const mirrored = { col: cols - 1 - spot.col, row: rows - 1 - spot.row };
      const mirroredIndex = blocks.findIndex((candidate) => candidate.col === mirrored.col && candidate.row === mirrored.row);
      if (mirroredIndex === -1) continue;
      const [mirrorSpot] = blocks.splice(mirroredIndex, 1);
      const type = rng.pick(types);
      level.hiddenPickups.push(
        { type, col: spot.col, row: spot.row, seed: Math.floor(rng.next() * 1e9) },
        { type, col: mirrorSpot.col, row: mirrorSpot.row, seed: Math.floor(rng.next() * 1e9) }
      );
    }

    // One visible pickup near each spawn.
    spawns.forEach((spawn, index) => {
      const spot = this.#pickPowerupSpot(level, spawn, rng, 2, 4);
      if (spot) {
        level.pickups.push({
          type: index === 0 ? "bomb" : "range",
          col: spot.col,
          row: spot.row,
          seed: Math.floor(rng.next() * 1e9),
          revealed: true,
          source: "floor"
        });
      }
    });

    if (options.mounts !== false) {
      level.mountEgg = null;
    }

    level.enemies = [];
    level.introEnemy = null;
    level.roster = [];
    level.parTime = 120;
    this.#stampTileSeeds(level, rng);
    return level;
  }

  #initTiles(tiles, cols, rows) {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const border = col === 0 || row === 0 || col === cols - 1 || row === rows - 1;
        tiles[row * cols + col] = border ? TILE.WALL : TILE.FLOOR;
      }
    }
  }

  #carveHardLayout(level, rng, pattern) {
    const { cols, rows, tiles } = level;
    const setWall = (col, row) => {
      if (col <= 0 || row <= 0 || col >= cols - 1 || row >= rows - 1) return;
      tiles[row * cols + col] = TILE.WALL;
    };

    if (pattern === 0) {
      // Pillars with a looser rhythm than classic Bomberman.
      for (let row = 2; row < rows - 2; row += 2) {
        for (let col = 2; col < cols - 2; col += 2) {
          if (rng.chance(0.84)) setWall(col, row);
          if (rng.chance(0.15)) setWall(col + (rng.chance(0.5) ? 1 : -1), row);
        }
      }
    } else if (pattern === 1) {
      // Broken rooms with doorways.
      for (let row = 2; row < rows - 2; row += 3) {
        const door = rng.int(2, cols - 3);
        for (let col = 1; col < cols - 1; col += 1) {
          if (Math.abs(col - door) > 1) setWall(col, row);
        }
      }
      for (let col = 3; col < cols - 2; col += 4) {
        const gap = rng.int(2, rows - 3);
        for (let row = 1; row < rows - 1; row += 1) {
          if (Math.abs(row - gap) > 1) setWall(col, row);
        }
      }
    } else if (pattern === 2) {
      // Scattered megaliths and short walls.
      for (let i = 0; i < 18 + level.number % 6; i += 1) {
        const col = rng.int(2, cols - 3);
        const row = rng.int(2, rows - 3);
        setWall(col, row);
        if (rng.chance(0.45)) setWall(col + rng.pick([-1, 1]), row);
        if (rng.chance(0.25)) setWall(col, row + rng.pick([-1, 1]));
      }
    } else if (pattern === 3) {
      // A cross-shaped coliseum with four gates.
      const cx = Math.floor(cols / 2);
      const cy = Math.floor(rows / 2);
      for (let col = 3; col < cols - 3; col += 1) {
        if (Math.abs(col - cx) > 1) setWall(col, cy);
      }
      for (let row = 3; row < rows - 3; row += 1) {
        if (Math.abs(row - cy) > 1) setWall(cx, row);
      }
      for (let i = 0; i < 8; i += 1) {
        const col = rng.int(2, cols - 3);
        const row = rng.int(2, rows - 3);
        setWall(col, row);
      }
    } else if (pattern === 4) {
      // Diamond outline with generous openings.
      const cx = Math.floor(cols / 2);
      const cy = Math.floor(rows / 2);
      for (let col = 1; col < cols - 1; col += 1) {
        for (let row = 1; row < rows - 1; row += 1) {
          const d = Math.abs(col - cx) / (cols * 0.42) + Math.abs(row - cy) / (rows * 0.42);
          if (d > 0.82 && d < 1.04 && rng.chance(0.58)) setWall(col, row);
        }
      }
    } else if (pattern === 5) {
      // Long rails with side chambers.
      for (let row = 3; row < rows - 3; row += 3) {
        for (let col = 1; col < cols - 1; col += 1) {
          if (rng.chance(0.75)) setWall(col, row);
        }
      }
      for (let i = 0; i < 7; i += 1) {
        const col = rng.int(2, cols - 3);
        const row = rng.int(1, rows - 2);
        setWall(col, row);
        setWall(col, Math.min(rows - 2, row + 1));
      }
    } else if (pattern === 6) {
      // Two halves separated by a broken spine.
      const cx = Math.floor(cols / 2);
      for (let row = 2; row < rows - 2; row += 1) {
        if (row < 4 || row > rows - 5 || rng.chance(0.12)) continue;
        setWall(cx, row);
      }
      for (let i = 0; i < 12; i += 1) {
        const col = rng.int(2, cols - 3);
        const row = rng.int(2, rows - 3);
        setWall(col, row);
      }
    } else {
      // Winding maze teeth.
      for (let row = 2; row < rows - 2; row += 2) {
        for (let col = 2; col < cols - 2; col += 3) {
          const offset = (row / 2) % 2 === 0 ? 0 : 1;
          setWall(col + offset, row);
          if (rng.chance(0.6)) setWall(col + offset + 1, row);
        }
      }
      for (let i = 0; i < 6; i += 1) {
        setWall(rng.int(2, cols - 3), rng.int(2, rows - 3));
      }
    }

    // Random monolithic decorations that break up perfectly regular grids.
    for (let i = 0; i < 4 + (level.number % 4); i += 1) {
      const col = rng.int(2, cols - 3);
      const row = rng.int(2, rows - 3);
      if (rng.chance(0.45)) setWall(col, row);
    }
  }

  #clearArea(tiles, cols, rows, col, row, radius, onlyBlocks = false) {
    for (let y = row - radius; y <= row + radius; y += 1) {
      for (let x = col - radius; x <= col + radius; x += 1) {
        if (x <= 0 || y <= 0 || x >= cols - 1 || y >= rows - 1) continue;
        if (Math.abs(x - col) + Math.abs(y - row) > radius + 1) continue;
        const current = tiles[y * cols + x];
        if (onlyBlocks) {
          if (current === TILE.BLOCK) tiles[y * cols + x] = TILE.FLOOR;
        } else {
          // Interior tiles only: the outer border was excluded above.
          tiles[y * cols + x] = TILE.FLOOR;
        }
      }
    }
    // Force the central tile to be clear even if a blanket edge was selected.
    if (col > 0 && row > 0 && col < cols - 1 && row < rows - 1) tiles[row * cols + col] = TILE.FLOOR;
  }

  #reserveCircle(set, cols, rows, col, row, radius) {
    for (let y = row - radius; y <= row + radius; y += 1) {
      for (let x = col - radius; x <= col + radius; x += 1) {
        if (x <= 0 || y <= 0 || x >= cols - 1 || y >= rows - 1) continue;
        set.add(keyOf(x, y));
      }
    }
  }

  #walkableCells(level, includeBlocks = false) {
    const cells = [];
    for (let row = 1; row < level.rows - 1; row += 1) {
      for (let col = 1; col < level.cols - 1; col += 1) {
        const tile = level.tiles[row * level.cols + col];
        if (tile === TILE.FLOOR || (includeBlocks && tile === TILE.BLOCK)) cells.push({ col, row });
      }
    }
    return cells;
  }

  #components(level) {
    const { cols, rows, tiles } = level;
    const visited = new Uint8Array(cols * rows);
    const components = [];
    for (let row = 1; row < rows - 1; row += 1) {
      for (let col = 1; col < cols - 1; col += 1) {
        const idx = row * cols + col;
        if (visited[idx] || tiles[idx] !== TILE.FLOOR) continue;
        const queue = [[col, row]];
        const component = [];
        visited[idx] = 1;
        while (queue.length) {
          const [x, y] = queue.pop();
          component.push({ col: x, row: y });
          for (const [dx, dy] of DIRS) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx <= 0 || ny <= 0 || nx >= cols - 1 || ny >= rows - 1) continue;
            const ni = ny * cols + nx;
            if (visited[ni] || tiles[ni] !== TILE.FLOOR) continue;
            visited[ni] = 1;
            queue.push([nx, ny]);
          }
        }
        components.push(component);
      }
    }
    return components.sort((a, b) => b.length - a.length);
  }

  #ensureConnectivity(level) {
    const { cols, rows, tiles } = level;
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const components = this.#components(level);
      if (components.length <= 1) break;
      const main = components[0];
      const target = components[1];
      let best = null;
      for (const a of main) {
        for (const b of target) {
          const d = Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
          if (!best || d < best.d) best = { a, b, d };
          if (best.d <= 2) break;
        }
        if (best?.d <= 2) break;
      }
      if (!best) break;
      // Carve a dog-leg corridor through walls. This keeps the arena connected
      // without exposing a direct, uninteresting straight line.
      let x = best.a.col;
      let y = best.a.row;
      while (x !== best.b.col) {
        if (x > 0 && x < cols - 1 && y > 0 && y < rows - 1) tiles[y * cols + x] = TILE.FLOOR;
        x += Math.sign(best.b.col - x);
      }
      while (y !== best.b.row) {
        if (x > 0 && x < cols - 1 && y > 0 && y < rows - 1) tiles[y * cols + x] = TILE.FLOOR;
        y += Math.sign(best.b.row - y);
      }
      if (x > 0 && x < cols - 1 && y > 0 && y < rows - 1) tiles[y * cols + x] = TILE.FLOOR;
    }
  }

  #pickExit(level, spawn, rng) {
    const cells = this.#walkableCells(level).filter((cell) => manhattan(cell, spawn) >= level.cols + level.rows - 9);
    if (cells.length) return rng.pick(cells);
    const all = this.#walkableCells(level);
    return all[Math.floor(rng.next() * all.length)] || { col: level.cols - 2, row: level.rows - 2 };
  }

  #selectEnemies(levelNumber, count, rng) {
    const unlocked = ENEMY_LIST.filter((enemy) => enemy.unlock <= levelNumber);
    const newEnemy = unlocked.find((enemy) => enemy.unlock === levelNumber);
    const result = [];
    if (newEnemy) result.push(newEnemy.key);

    const weightFor = (enemy) => {
      let base = {
        crawler: 10,
        runner: 8,
        hunter: 8,
        golem: 4,
        hopper: 5,
        firetail: 4,
        coward: 3,
        phantom: 4,
        trickster: 3,
        splitter: 4,
        burrower: 3,
        turret: 3
      }[enemy.key] || 3;
      // Keep early levels approachable, then mix in more specialists.
      if (levelNumber < 6 && ["golem", "trickster", "phantom"].includes(enemy.key)) base -= 2;
      if (levelNumber > 30) base += 1;
      return Math.max(1, base);
    };

    const used = new Set(result);
    while (result.length < count) {
      const candidates = unlocked.filter((enemy) => used.size < 3 || !used.has(enemy.key) || rng.chance(0.3));
      const picked = rng.weighted(candidates.map((enemy) => [enemy.key, weightFor(enemy)]));
      result.push(picked);
      used.add(picked);
    }
    // Guarantee at least three visually distinct enemies on mid/late stages.
    if (new Set(result).size < Math.min(3, count) && unlocked.length >= 3) {
      for (let i = 0; i < result.length && new Set(result).size < 3; i += 1) {
        const replacement = rng.pick(unlocked.filter((enemy) => !result.includes(enemy.key)));
        if (replacement) result[i] = replacement.key;
      }
    }
    return shuffle(result, () => rng.next());
  }

  #pickEnemySpots(level, spawn, count, rng) {
    const candidates = this.#walkableCells(level).filter((cell) => {
      if (manhattan(cell, spawn) < 5) return false;
      if (level.exit && manhattan(cell, level.exit) < 2) return false;
      return true;
    });
    const shuffled = shuffle(candidates, () => rng.next());
    const result = [];
    for (const cell of shuffled) {
      if (result.some((existing) => manhattan(existing, cell) < 2)) continue;
      result.push(cell);
      if (result.length >= count) break;
    }
    // If the map is extremely tight, relax the spacing constraint.
    if (result.length < count) {
      for (const cell of shuffled) {
        if (result.some((existing) => existing.col === cell.col && existing.row === cell.row)) continue;
        result.push(cell);
        if (result.length >= count) break;
      }
    }
    return result;
  }

  #pickOpenSpot(level, minDistance, rng, { avoid = null, reserved = null, nearExit = 2 } = {}) {
    const options = this.#walkableCells(level).filter((cell) => {
      if (avoid && manhattan(cell, avoid) < minDistance) return false;
      if (reserved?.has(keyOf(cell.col, cell.row))) return false;
      if (nearExit && level.exit && manhattan(cell, level.exit) < nearExit) return false;
      return true;
    });
    return options.length ? rng.pick(options) : null;
  }

  #pickPowerupSpot(level, spawn, rng, minDistance, maxDistance) {
    const occupied = new Set([
      ...level.enemies.map((enemy) => keyOf(enemy.col, enemy.row)),
      ...level.pickups.map((pickup) => keyOf(pickup.col, pickup.row))
    ]);
    const options = this.#walkableCells(level).filter((cell) => {
      const d = manhattan(cell, spawn);
      if (d < minDistance || d > maxDistance) return false;
      if (level.exit && manhattan(cell, level.exit) < 2) return false;
      if (level.mountEgg && manhattan(cell, level.mountEgg) < 1) return false;
      if (occupied.has(keyOf(cell.col, cell.row))) return false;
      return true;
    });
    return options.length ? rng.pick(options) : null;
  }

  #allBlocks(tiles, cols, rows) {
    const blocks = [];
    for (let row = 1; row < rows - 1; row += 1) {
      for (let col = 1; col < cols - 1; col += 1) {
        if (tiles[row * cols + col] === TILE.BLOCK) blocks.push({ col, row });
      }
    }
    return blocks;
  }

  #pickLevelFocus(levelNumber, rng) {
    const unlocked = Object.keys(POWERUPS).filter(
      (key) => (POWERUP_UNLOCK_LEVEL[key] || 1) <= levelNumber && POWERUPS[key].rarity !== "legendary"
    );
    const newPower = Object.entries(POWERUP_UNLOCK_LEVEL).find(([, unlock]) => unlock === levelNumber)?.[0];
    if (newPower) return newPower;
    const guaranteed = ["bomb", "range", "speed", "armor", "detonator", "kick", "throw", "wallpass"];
    if (rng.chance(0.65)) return rng.pick(guaranteed.slice(0, Math.min(guaranteed.length, 3 + Math.floor(levelNumber / 8))));
    return rng.pick(unlocked);
  }

  #selectPowerups(levelNumber, count, rng, focus = null) {
    const unlocked = Object.keys(POWERUPS).filter((key) => (POWERUP_UNLOCK_LEVEL[key] || 1) <= levelNumber);
    const result = focus ? [focus] : [];
    while (result.length < count) {
      const candidates = unlocked.filter((key) => {
        if (!POWERUP_WEIGHTS[key]) return false;
        const existing = result.filter((item) => item === key).length;
        return existing < (key === "phoenix" ? 1 : 3);
      });
      if (!candidates.length) break;
      result.push(rng.weighted(candidates.map((key) => [key, POWERUP_WEIGHTS[key]])));
    }
    return result;
  }

  #stampTileSeeds(level, rng) {
    for (let row = 0; row < level.rows; row += 1) {
      for (let col = 0; col < level.cols; col += 1) {
        const index = row * level.cols + col;
        level.tileSeeds[index] = (hash2d(col, row, level.seed) * 2 ** 31) ^ Math.floor(rng.next() * 2 ** 31);
      }
    }
    // Ambient decorations are generated from a separate deterministic stream.
    level.decorSeed = Math.floor(rng.next() * 2 ** 31);
  }
}

export const levelGenerator = new LevelGenerator(ARENA_COLS, ARENA_ROWS);

export function generateCampaignLevel(level, options = {}) {
  return levelGenerator.generate(level, options);
}

export function generateVersusArena(round = 1) {
  const visualLevel = 1 + ((round * 7 + Math.floor(Math.random() * 43)) % TOTAL_LEVELS);
  return levelGenerator.generate(visualLevel, { versus: true, seed: versusSeed(round), paletteSeed: levelSeed(visualLevel, 77) });
}

// Left in place so tests can verify the exported level dimensions without
// constructing a Game instance.
export const MAP_DIMENSIONS = { cols: ARENA_COLS, rows: ARENA_ROWS };
