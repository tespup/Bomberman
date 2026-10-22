#!/usr/bin/env node
/**
 * Headless gameplay/data validation. No dependencies and no browser needed:
 * this exercises all 50 generated levels, level connectivity, every power-up,
 * the bomb lifecycle and the versus round result.
 */
import assert from "node:assert/strict";
import { generateCampaignLevel } from "../src/game/level.js";
import { TILE, ENEMY_LIST, POWERUP_LIST, TOTAL_LEVELS } from "../src/game/catalog.js";
import { Player } from "../src/game/player.js";
import { Enemy } from "../src/game/enemy.js";
import { Game } from "../src/game/game.js";

const failures = [];
const check = (label, fn) => {
  try {
    fn();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.error(`  ✗ ${label}\n    ${error.message}`);
  }
};

function flood(level) {
  const { cols, rows, tiles } = level;
  const start = level.spawns[0];
  const seen = new Uint8Array(cols * rows);
  const queue = [start.row * cols + start.col];
  seen[start.row * cols + start.col] = 1;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  while (queue.length) {
    const index = queue.pop();
    const x = index % cols;
    const y = Math.floor(index / cols);
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx <= 0 || ny <= 0 || nx >= cols - 1 || ny >= rows - 1) continue;
      const ni = ny * cols + nx;
      if (seen[ni]) continue;
      if (tiles[ni] === TILE.WALL) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}

function fakes() {
  const commands = [];
  const input = {
    vector: { x: 0, y: 0 },
    getMoveVector() {
      return this.vector;
    },
    setEnabled() {},
    reset() {
      this.vector = { x: 0, y: 0 };
    }
  };
  const played = [];
  const audio = {
    play(name, options) {
      played.push(name);
    },
    startMusic() {},
    stopMusic() {},
    setPaused() {},
    settings: { music: false, sfx: false, musicVolume: 0, sfxVolume: 0 }
  };
  const events = { toasts: [], completes: [], gameovers: [], rounds: [] };
  const game = new Game({
    input,
    audio,
    particleQuality: "low",
    callbacks: {
      onToast: (payload) => events.toasts.push(payload),
      onLevelComplete: (result) => events.completes.push(result),
      onGameOver: (result) => events.gameovers.push(result),
      onVersusRoundEnd: (result) => events.rounds.push(result)
    }
  });
  return { input, audio, game, events, commands, played };
}

function tick(game, seconds, step = 0.02) {
  const iterations = Math.ceil(seconds / step);
  for (let i = 0; i < iterations; i += 1) {
    game.update(step);
    if (game.state !== "playing" && game.state !== "intro") break;
  }
}

console.log("\nBOMBMAN data validation\n");
const levels = [];
const palettes = new Set();
const names = new Set();
const enemyTypes = new Set();
const powerTypes = new Set();
for (let levelNumber = 1; levelNumber <= TOTAL_LEVELS; levelNumber += 1) {
  const level = generateCampaignLevel(levelNumber);
  levels.push(level);
  const key = Object.values(level.palette)
    .filter((value) => typeof value === "string")
    .join("|");
  palettes.add(key);
  names.add(level.name);
}

check("все 50 уровней генерируются с уникальными палитрами", () => {
  assert.equal(levels.length, 50);
  assert.equal(palettes.size, 50, `unique palettes: ${palettes.size}`);
});

check("все 50 названий уровней уникальны", () => {
  assert.equal(names.size, 50);
});

check("карты имеют границы и связный пол", () => {
  for (const level of levels) {
    assert.equal(level.cols, 15);
    assert.equal(level.rows, 13);
    for (let x = 0; x < level.cols; x += 1) {
      assert.equal(level.tiles[x], TILE.WALL);
      assert.equal(level.tiles[(level.rows - 1) * level.cols + x], TILE.WALL);
    }
    for (let y = 0; y < level.rows; y += 1) {
      assert.equal(level.tiles[y * level.cols], TILE.WALL);
      assert.equal(level.tiles[y * level.cols + level.cols - 1], TILE.WALL);
    }
    const reachable = flood(level);
    const exitIndex = level.exit.row * level.cols + level.exit.col;
    assert.equal(reachable[exitIndex], 1, `exit unreachable on level ${level.number}`);
    for (const enemy of level.enemies) {
      const index = enemy.row * level.cols + enemy.col;
      assert.equal(reachable[index], 1, `enemy unreachable on level ${level.number}`);
      const tile = level.tiles[index];
      assert.notEqual(tile, TILE.WALL);
      assert.notEqual(tile, TILE.BLOCK);
      enemyTypes.add(enemy.type);
    }
    assert.equal(level.tiles[level.spawns[0].row * level.cols + level.spawns[0].col], TILE.FLOOR);
  }
});

check("видны все 12 типов врагов", () => {
  assert.ok(enemyTypes.size >= 12, `found ${enemyTypes.size}: ${[...enemyTypes]}`);
});

check("на картах есть все 12 типов бонусов (с учётом видимых)", () => {
  for (const level of levels) {
    for (const pickup of [...level.pickups, ...level.hiddenPickups]) powerTypes.add(pickup.type);
  }
  assert.ok(powerTypes.size >= 12, `found ${powerTypes.size}: ${[...powerTypes]}`);
  for (const key of Object.keys(POWERUP_LIST ? Object.fromEntries(POWERUP_LIST.map((p) => [p.key, p])) : {})) {
    assert.ok(powerTypes.has(key), `missing powerup ${key}`);
  }
});

check("скрытые бонусы стоят на блоках, а не в стенах", () => {
  for (const level of levels) {
    for (const pickup of level.hiddenPickups) {
      const tile = level.tiles[pickup.row * level.cols + pickup.col];
      assert.equal(tile, TILE.BLOCK, `hidden pickup not on block at ${level.number} ${pickup.col},${pickup.row}`);
    }
  }
});

check("ездовые животные появляются в кампании", () => {
  const mounted = levels.filter((level) => level.mountEgg);
  assert.ok(mounted.length >= 8, `only ${mounted.length} mount levels`);
  for (const level of mounted) {
    const tile = level.tiles[level.mountEgg.row * level.cols + level.mountEgg.col];
    assert.equal(tile, TILE.FLOOR);
  }
});

console.log("\nGameplay lifecycle\n");

check("фабрика уровня и старт кампании", () => {
  const { game } = fakes();
  const level = game.prepareCampaign(1);
  assert.equal(game.state, "intro");
  assert.equal(game.players.length, 1);
  assert.equal(game.enemies.length, level.enemies.length);
  game.begin();
  assert.equal(game.state, "playing");
  assert.equal(game.players[0].baseBombs, 1);
  assert.equal(game.players[0].baseRange, 1);
});

check("игрок двигается и не проходит монолит", () => {
  const { game, input } = fakes();
  game.prepareCampaign(1);
  game.begin();
  const player = game.players[0];
  const startX = player.x;
  input.vector = { x: 1, y: 0 };
  tick(game, 0.3);
  assert.ok(player.x > startX, "player did not move right");
  input.vector = { x: 0, y: -1 };
  tick(game, 0.8);
  assert.ok(player.y > 1, "player escaped through the border");
});

check("бомба взрывается, ломает блок и открывает бонус", () => {
  const { game } = fakes();
  const level = game.prepareCampaign(2);
  game.begin();
  game.enemies.forEach((enemy) => {
    enemy.alive = false;
    enemy.dying = 0;
  });
  const player = game.players[0];
  // Find a floor tile with a nearby breakable block.
  let target = null;
  search:
  for (let row = 1; row < level.rows - 1; row += 1) {
    for (let col = 1; col < level.cols - 1; col += 1) {
      if (level.tiles[row * level.cols + col] !== TILE.FLOOR) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = col + dx;
        const ny = row + dy;
        if (level.tiles[ny * level.cols + nx] === TILE.BLOCK) {
          target = { col, row };
          break search;
        }
      }
    }
  }
  assert.ok(target, "no block-adjacent floor found");
  player.setTile(target.col, target.row);
  player.invulnerable = 99;
  assert.ok(game.placeBomb(player), "bomb not placed");
  const beforeBlocks = game.blocksDestroyed;
  tick(game, 2.8);
  assert.equal(game.bombs.length, 0, "bomb still active after fuse");
  assert.ok(game.blocksDestroyed > beforeBlocks, "no blocks destroyed");
});

check("бонусы переносятся в следующий уровень", () => {
  const { game } = fakes();
  game.prepareCampaign(1);
  game.begin();
  const first = game.players[0];
  first.addPowerup("range");
  first.addPowerup("bomb");
  first.addPowerup("speed");
  first.addPowerup("armor");
  first.addPowerup("phoenix");
  first.addPowerup("detonator");
  first.addPowerup("wallpass");
  first.mountCreature("drake", game);
  const loadout = first.getLoadout();
  assert.equal(loadout.baseRange, 2);
  assert.equal(loadout.baseBombs, 2);
  assert.equal(loadout.armor, 1);
  assert.equal(loadout.maxHearts, 4);
  assert.ok(loadout.powers.includes("detonator"));
  assert.equal(loadout.mountKey, "drake");

  game.prepareCampaign(2, { loadout });
  const second = game.players[0];
  assert.equal(second.baseRange, 2, "range did not carry");
  assert.equal(second.baseBombs, 2, "bomb count did not carry");
  assert.equal(second.speedLevels, 1, "speed did not carry");
  assert.equal(second.armor, 1, "armor did not carry");
  assert.equal(second.maxHearts, 4, "phoenix max heart did not carry");
  assert.equal(second.hearts, 4, "new level should start at full carried health");
  assert.ok(second.hasPower("detonator"), "detonator did not carry");
  assert.ok(second.hasPower("wallpass"), "wallpass did not carry");
  assert.equal(second.mount?.key, "drake", "mount did not carry");
  assert.equal(game.levelStartLoadout.baseRange, 2);
});

check("при смерти и повторе уровня возвращается снаряжение на старте уровня", () => {
  const { game } = fakes();
  const carried = { baseRange: 3, baseBombs: 2, speedLevels: 0, maxHearts: 4, armor: 1, powers: ["kick"], powerLevels: { range: 2, bomb: 1, phoenix: 1 }, mountKey: null };
  game.prepareCampaign(2, { loadout: carried });
  game.begin();
  const player = game.players[0];
  assert.equal(player.baseRange, 3);
  player.addPowerup("range");
  assert.equal(player.baseRange, 4);
  game.restartLevel();
  assert.equal(game.players[0].baseRange, 3, "restart should restore the level start loadout, not in-level extras");
  assert.equal(game.players[0].baseBombs, 2);
});

check("все 12 бонусов применяются к игроку", () => {
  const { game } = fakes();
  game.prepareCampaign(1);
  game.begin();
  const player = game.players[0];
  for (const def of POWERUP_LIST) {
    player.addPowerup(def.key);
  }
  assert.ok(player.baseRange >= 2);
  assert.ok(player.baseBombs >= 2);
  assert.ok(player.speedLevels >= 1);
  assert.ok(player.armor >= 1);
  assert.ok(player.maxHearts >= 4);
  for (const key of ["detonator", "wallpass", "throw", "proximity", "kick", "immunity", "magnet"]) {
    assert.ok(player.hasPower(key), `missing ${key}`);
  }
});

check("детонатор: бомба не взрывается фитилём и взрывается кнопкой", () => {
  const { game } = fakes();
  game.prepareCampaign(1);
  game.begin();
  game.enemies.forEach((e) => { e.alive = false; e.dying = 0; });
  const player = game.players[0];
  player.addPowerup("detonator");
  player.invulnerable = 99;
  assert.ok(game.placeBomb(player));
  assert.equal(game.bombs[0].mode, "remote");
  tick(game, 3.3);
  assert.equal(game.bombs.length, 1, "remote bomb auto-detonated");
  assert.ok(game.detonate(player), "detonate failed");
  tick(game, 0.1);
  assert.equal(game.bombs.length, 0);
});

check("игрок останавливается ровно в центре клетки", () => {
  const { game, input } = fakes();
  game.prepareCampaign(1);
  game.begin();
  const player = game.players[0];
  input.vector = { x: 1, y: 0 };
  tick(game, 0.12);
  input.vector = { x: 0, y: 0 };
  tick(game, 0.6);
  assert.equal(player.x, player.col + 0.5, `x is not snapped: ${player.x}, col=${player.col}`);
  assert.equal(player.y, player.row + 0.5, `y is not snapped: ${player.y}, row=${player.row}`);
  assert.ok(Number.isInteger(player.col) && Number.isInteger(player.row), "player left the grid");
});

check("после установки бомбы игрок может уйти с неё", () => {
  const { game, input } = fakes();
  game.prepareCampaign(1);
  game.begin();
  game.enemies.forEach((e) => { e.alive = false; e.dying = 0; });
  const player = game.players[0];
  player.invulnerable = 99;
  const startX = player.x;
  assert.ok(game.placeBomb(player), "bomb not placed");
  input.vector = { x: 1, y: 0 };
  tick(game, 0.3);
  assert.ok(player.x > startX + 0.6, `player got stuck on the bomb at x=${player.x}`);
  assert.ok(game.bombs.length === 1, "bomb disappeared unexpectedly");
});

check("пинок катит бомбу по коридору", () => {
  const { game } = fakes();
  const level = game.prepareCampaign(2);
  game.begin();
  game.enemies.forEach((e) => { e.alive = false; e.dying = 0; });
  const player = game.players[0];
  player.addPowerup("kick");
  // Find a clear two-tile corridor.
  let spot = null;
  for (let row = 1; row < level.rows - 1 && !spot; row += 1) {
    for (let col = 1; col < level.cols - 1; col += 1) {
      if (level.tiles[row * level.cols + col] === TILE.FLOOR && level.tiles[row * level.cols + col + 1] === TILE.FLOOR) {
        spot = { col, row };
        break;
      }
    }
  }
  assert.ok(spot);
  player.setTile(spot.col, spot.row);
  player.invulnerable = 99;
  assert.ok(game.placeBomb(player));
  const bomb = game.bombs[0];
  const startX = bomb.x;
  const kicked = game.kickBomb(bomb, { x: 1, y: 0 }, player);
  assert.equal(kicked, true);
  tick(game, 0.4);
  assert.ok(bomb.x > startX, "bomb did not slide");
});

check("сенсорный взрыватель реагирует на приближение", () => {
  const { game } = fakes();
  game.prepareCampaign(1);
  game.begin();
  game.enemies.forEach((e) => { e.alive = false; e.dying = 0; });
  const player = game.players[0];
  player.addPowerup("proximity");
  player.invulnerable = 99;
  assert.ok(game.placeBomb(player));
  const bomb = game.bombs[0];
  assert.equal(bomb.mode, "normal");
  assert.ok(bomb.proximity);
  // The player standing on the bomb is enough for the proximity sensor.
  tick(game, 0.4);
  assert.equal(bomb.exploded, true);
});

check("бомбомёт поднимает бомбу в полёт", () => {
  const { game } = fakes();
  const level = game.prepareCampaign(2);
  game.begin();
  game.enemies.forEach((e) => { e.alive = false; e.dying = 0; });
  const player = game.players[0];
  player.addPowerup("throw");
  let spot = null;
  for (let row = 1; row < level.rows - 1 && !spot; row += 1) {
    for (let col = 1; col < level.cols - 5; col += 1) {
      if ([0, 1, 2, 3].every((offset) => level.tiles[row * level.cols + col + offset] === TILE.FLOOR)) {
        spot = { col, row };
        break;
      }
    }
  }
  assert.ok(spot);
  player.setTile(spot.col, spot.row);
  player.dir = { x: 1, y: 0 };
  player.invulnerable = 99;
  assert.ok(game.placeBomb(player));
  const bomb = game.bombs[0];
  assert.equal(game.throwBomb(player, bomb), true);
  assert.ok(bomb.flight, "bomb has no flight state");
  tick(game, 0.7);
  assert.equal(bomb.flight, null, "bomb never landed");
});

check("фазовый пояс пропускает сквозь хрупкий блок", () => {
  const { game } = fakes();
  const level = game.prepareCampaign(2);
  game.begin();
  const player = game.players[0];
  player.addPowerup("wallpass");
  let spot = null;
  for (let row = 1; row < level.rows - 1 && !spot; row += 1) {
    for (let col = 1; col < level.cols - 1; col += 1) {
      if (level.tiles[row * level.cols + col] === TILE.BLOCK) {
        spot = { col, row };
        break;
      }
    }
  }
  assert.ok(spot);
  assert.equal(game.canPlayerOccupy(player, spot.col + 0.5, spot.row + 0.5), true);
});

check("потеря всех сердец завершает игру", () => {
  const { game, events } = fakes();
  game.prepareCampaign(1);
  game.begin();
  const player = game.players[0];
  for (let i = 0; i < 3; i += 1) {
    player.invulnerable = 0;
    game.hurtPlayer(player, { source: "enemy" });
    player.invulnerable = 0;
  }
  game.update(0.1);
  assert.equal(game.state, "gameOver", `state ${game.state}`);
  assert.equal(events.gameovers.length, 1);
});

check("огнеупорность защищает от собственной бомбы", () => {
  const { game } = fakes();
  game.prepareCampaign(1);
  game.begin();
  game.enemies.forEach((e) => { e.alive = false; e.dying = 0; });
  const player = game.players[0];
  player.addPowerup("immunity");
  player.invulnerable = 0;
  const hearts = player.hearts;
  assert.ok(game.placeBomb(player));
  tick(game, 2.7);
  assert.equal(player.hearts, hearts, "immunity did not protect");
});

check("бронежилет поглощает контактный удар", () => {
  const { game } = fakes();
  game.prepareCampaign(1);
  game.begin();
  const player = game.players[0];
  player.armor = 1;
  player.invulnerable = 0;
  const hearts = player.hearts;
  game.hurtPlayer(player, { source: "enemy" });
  assert.equal(player.armor, 0);
  assert.equal(player.hearts, hearts);
  assert.ok(player.invulnerable > 0);
});

check("животное даёт щит и способность", () => {
  const { game } = fakes();
  game.prepareCampaign(4);
  game.begin();
  const level = game.level;
  const player = game.players[0];
  if (!level.mountEgg) {
    level.mountEgg = { type: "drake", col: 2, row: 2, seed: 1 };
    game.mountEggUsed = false;
    game.baseMountEgg = { ...level.mountEgg };
  }
  game.hatchEgg(player, level.mountEgg);
  assert.ok(player.mount, "mount not applied");
  const mountKey = player.mount.key;
  player.mountActionCooldown = 0;
  game.useMountAbility(player);
  assert.ok(player.mount || mountKey === "roo", "mount ability broke state");
});

check("все 12 типов врагов обновляются без ошибок", () => {
  const { game } = fakes();
  const level = game.prepareCampaign(30);
  game.begin();
  game.enemies.forEach((e) => { e.alive = false; e.dying = 0; });
  game.portalActive = false;
  game.players[0].invulnerable = 999;
  const open = [];
  for (let row = 1; row < level.rows - 1; row += 1) {
    for (let col = 1; col < level.cols - 1; col += 1) {
      if (level.tiles[row * level.cols + col] === TILE.FLOOR) open.push({ col, row });
    }
  }
  for (const def of ENEMY_LIST) {
    const spot = open[(def.unlock * 7) % open.length];
    const enemy = new Enemy({ type: def.key, col: spot.col, row: spot.row, seed: 123 }, level, game);
    enemy.spawnGrace = 0;
    game.enemies.push(enemy);
  }
  tick(game, 4);
  assert.ok(game.enemies.length >= 12, "enemies disappeared completely");
});

const findOpenCell = (level, minX = 2, minY = 2) => {
  let fallback = null;
  for (let row = minY; row < level.rows - 1; row += 1) {
    for (let col = minX; col < level.cols - 1; col += 1) {
      if (level.tiles[row * level.cols + col] !== TILE.FLOOR) continue;
      fallback ??= { col, row };
      const neighbors = [
        [col + 1, row],
        [col - 1, row],
        [col, row + 1],
        [col, row - 1]
      ];
      if (neighbors.some(([x, y]) => level.tiles[y * level.cols + x] === TILE.FLOOR)) {
        return { col, row };
      }
    }
  }
  return fallback || { col: 1, row: 1 };
};

check("огнехвост оставляет не больше трёх огней", () => {
  const { game } = fakes();
  const level = game.prepareCampaign(10);
  game.begin();
  const spot = findOpenCell(level);
  const enemy = new Enemy({ type: "firetail", col: spot.col, row: spot.row, seed: 5 }, level, game);
  game.enemies = [enemy];
  game.players[0].invulnerable = 999;
  tick(game, 3);
  const owned = game.fireHazards.filter((fire) => fire.enemy === enemy);
  assert.ok(owned.length <= 3, `fire trail grew to ${owned.length}`);
  assert.ok(game.fireHazards.length > 0, "firetail left no fire");
});

check("деляга распадается на мини-слизней", () => {
  const { game } = fakes();
  const level = game.prepareCampaign(18);
  game.begin();
  const spot = findOpenCell(level);
  // Guarantee two landing zones around the splitter.
  if (spot.col + 1 < level.cols - 1) level.tiles[spot.row * level.cols + spot.col + 1] = TILE.FLOOR;
  if (spot.row + 1 < level.rows - 1) level.tiles[(spot.row + 1) * level.cols + spot.col] = TILE.FLOOR;
  const splitter = new Enemy({ type: "splitter", col: spot.col, row: spot.row, seed: 2 }, level, game);
  splitter.spawnGrace = 0;
  game.enemies = [splitter];
  splitter.takeDamage(1, game, "test");
  assert.equal(splitter.alive, false);
  assert.ok(game.enemies.some((enemy) => enemy.type === "mini"), "no minis spawned");
});

check("уничтожение всех врагов открывает портал и завершает уровень", () => {
  const { game, events } = fakes();
  game.prepareCampaign(1);
  game.begin();
  game.enemies.forEach((enemy) => {
    enemy.alive = false;
    enemy.dying = 0;
  });
  tick(game, 0.1);
  assert.equal(game.portalActive, true, "portal did not open");
  const exit = game.level.exit;
  game.players[0].setTile(exit.col, exit.row);
  game.players[0].invulnerable = 99;
  tick(game, 0.2);
  assert.equal(game.state, "levelComplete", `state ${game.state}`);
  assert.equal(events.completes.length, 1);
  assert.ok(events.completes[0].stars >= 1);
  assert.ok(events.completes[0].loadout, "level result must include the carry-over loadout");
});

check("режим дуэли: смерть P2 завершает раунд", () => {
  const { game, events } = fakes();
  game.prepareVersus(1);
  game.begin();
  assert.equal(game.players.length, 2);
  game.players[1].alive = false;
  game.players[1].hearts = 0;
  tick(game, 0.2);
  assert.equal(game.state, "roundOver", `state ${game.state}`);
  assert.equal(events.rounds.length, 1);
  assert.equal(events.rounds[0].winner, 0);
});

check("режим дуэли: одновременная смерть даёт ничью", () => {
  const { game, events } = fakes();
  game.prepareVersus(1);
  game.begin();
  game.players[0].alive = false;
  game.players[0].hearts = 0;
  game.players[1].alive = false;
  game.players[1].hearts = 0;
  tick(game, 0.2);
  assert.equal(game.state, "roundOver");
  assert.equal(events.rounds.length, 1);
  assert.equal(events.rounds[0].winner, -1);
});

check("победа над всеми 12 врагами возможна на высоком уровне", () => {
  const { game } = fakes();
  const level = game.prepareCampaign(30);
  game.begin();
  game.enemies = ENEMY_LIST.map((definition, index) => {
    const spot = { col: 2 + (index % 10), row: 2 + Math.floor(index / 10) };
    level.tiles[spot.row * level.cols + spot.col] = TILE.FLOOR;
    const enemy = new Enemy({ type: definition.key, col: spot.col, row: spot.row, seed: index + 1 }, level, game);
    enemy.spawnGrace = 0;
    return enemy;
  });
  for (let round = 0; round < 10; round += 1) {
    const living = game.enemies.filter((enemy) => enemy.alive);
    if (!living.length) break;
    for (const enemy of living) {
      enemy.spawnGrace = 0;
      while (enemy.alive) enemy.takeDamage(1, game, "test");
    }
  }
  tick(game, 0.3);
  const alive = game.enemies.filter((enemy) => enemy.alive);
  assert.equal(alive.length, 0, `${alive.length} enemies survived`);
});

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("\nAll BombMan checks passed.\n");
}
