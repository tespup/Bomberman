import {
  TILE,
  DIRECTIONS,
  POWERUPS,
  MOUNTS,
  STAR_THRESHOLDS,
  TOTAL_LEVELS
} from "./catalog.js";
import { generateCampaignLevel, generateVersusArena } from "./level.js";
import { Player } from "./player.js";
import { Enemy } from "./enemy.js";
import { ParticleSystem, FloatingTexts } from "./particles.js";
import { clamp, dist, formatTime } from "../core/utils.js";

const BOMB_FUSE = 2.45;
const REMOTE_FUSE = 30;
const BOMB_KICK_SPEED = 4.9;
const BREATH_COOLDOWN = 2.8;
const VERSUS_LIMIT = 120;

let BOMB_ID = 1;

export class Game {
  constructor({ input, audio, particleQuality = "high", callbacks = {} } = {}) {
    this.input = input;
    this.audio = audio;
    this.callbacks = callbacks;
    this.particles = new ParticleSystem(particleQuality);
    this.floatingTexts = new FloatingTexts();
    this.mode = "campaign";
    this.state = "idle";
    this.level = null;
    this.levelNumber = 1;
    this.players = [];
    this.enemies = [];
    this.bombs = [];
    this.explosions = [];
    this.fireHazards = [];
    this.projectiles = [];
    this.pickups = [];
    this.rings = [];
    this.time = 0;
    this.elapsed = 0;
    this.score = 0;
    this.kills = 0;
    this.bombsPlaced = 0;
    this.blocksDestroyed = 0;
    this.portalActive = false;
    this.portalAppear = 0;
    this.mountEggUsed = false;
    this.shakeAmount = 0;
    this.flash = 0;
    this.flashColor = "#ffffff";
    this.revealTimer = 0;
    this.hudTimer = 0;
    this._roundResolved = false;
    this._lastToast = { text: "", at: 0 };
    this._time = 0;
    this.quality = particleQuality;
    this.baseTiles = null;
    this.baseHiddenPickups = [];
    this.basePickups = [];
    this.baseMountEgg = null;
    this.levelStartLoadout = null;
    this.round = 1;
    this.versusScore = { p1: 0, p2: 0 };
    this.startedAt = 0;
    this._actionHint = "";
    this._lastHudKey = "";
    this.runNonce = 1;
  }

  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  setParticleQuality(quality) {
    this.quality = quality;
    this.particles.setQuality(quality);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  prepareCampaign(levelNumber, options = {}) {
    this.mode = "campaign";
    this.levelNumber = clamp(Number(levelNumber) || 1, 1, TOTAL_LEVELS);
    this.levelStartLoadout = options.loadout || null;
    const attemptSeed =
      options.seed ??
      ((Date.now() ^
        Math.imul(this.runNonce++, 2654435761) ^
        Math.floor(Math.random() * 0xffffffff)) >>>
        0);
    const level = generateCampaignLevel(this.levelNumber, { seed: attemptSeed });
    this.level = level;
    this.#cacheBaseLevel(level);
    this.#resetRuntime();
    this.state = "intro";
    this.audio.startMusic("game", {
      seed: level.music.seed,
      tempo: level.music.tempo,
      root: level.music.root,
      mode: level.music.mode
    });
    this.#emitHud(true);
    this.callbacks.onLevelPrepared?.(level, this);
    return level;
  }

  prepareVersus(round = 1, score = { p1: 0, p2: 0 }) {
    this.mode = "versus";
    this.levelStartLoadout = null;
    this.round = round;
    this.versusScore = { ...score };
    const level = generateVersusArena(round);
    level.number = round;
    level.name = ["Зеркальная арена", "Расколотый зал", "Пылающий дуэт", "Финальный раунд"][Math.min(3, round - 1)] || "Дуэль";
    this.level = level;
    this.levelNumber = round;
    this.#cacheBaseLevel(level);
    this.#resetRuntime();
    this.state = "intro";
    this.audio.startMusic("game", {
      seed: level.music.seed ^ 0x333,
      tempo: Math.min(124, level.music.tempo + 6),
      root: level.music.root + 2,
      mode: level.music.mode
    });
    this.#emitHud(true);
    this.callbacks.onLevelPrepared?.(level, this);
    return level;
  }

  begin() {
    if (!this.level) return;
    this.state = "playing";
    this.startedAt = performance.now();
    for (const player of this.players) player.invulnerable = Math.max(player.invulnerable, 1.8);
    this.audio.play("levelStart", { volume: 0.8 });
    this.callbacks.onGameStarted?.(this);
    this.#emitHud(true);
  }

  restartLevel() {
    if (!this.level) return;
    this.#resetRuntime();
    this.state = "playing";
    this.startedAt = performance.now();
    for (const player of this.players) player.invulnerable = 2.2;
    this.audio.startMusic("game", {
      seed: this.level.music.seed,
      tempo: this.level.music.tempo,
      root: this.level.music.root,
      mode: this.level.music.mode
    });
    this.callbacks.onGameStarted?.(this);
    this.#emitHud(true);
  }

  stop() {
    this.state = "idle";
    this.input.setEnabled(false);
    this.input.reset();
    this.audio.stopMusic(0.3);
  }

  setPaused(paused) {
    if (paused && this.state === "playing") {
      this.state = "paused";
      this.input.reset();
      this.audio.setPaused(true);
    } else if (!paused && this.state === "paused") {
      this.state = "playing";
      this.audio.setPaused(false);
    }
  }

  #cacheBaseLevel(level) {
    this.baseTiles = level.tiles.slice();
    this.baseHiddenPickups = level.hiddenPickups.map((pickup) => ({ ...pickup }));
    this.basePickups = level.pickups.map((pickup) => ({ ...pickup }));
    this.baseMountEgg = level.mountEgg ? { ...level.mountEgg } : null;
  }

  #resetRuntime() {
    const level = this.level;
    level.tiles = this.baseTiles.slice();
    level.hiddenPickups = this.baseHiddenPickups.map((pickup) => ({ ...pickup }));
    level.pickups = this.basePickups.map((pickup) => ({ ...pickup }));
    level.mountEgg = this.baseMountEgg ? { ...this.baseMountEgg } : null;

    this.enemies = [];
    this.bombs = [];
    this.explosions = [];
    this.fireHazards = [];
    this.projectiles = [];
    this.pickups = [];
    this.rings = [];
    this.time = 0;
    this.elapsed = 0;
    this.score = 0;
    this.kills = 0;
    this.bombsPlaced = 0;
    this.blocksDestroyed = 0;
    this.portalActive = false;
    this.portalAppear = 0;
    this.mountEggUsed = false;
    this.shakeAmount = 0;
    this.flash = 0;
    this.revealTimer = 0;
    this.hudTimer = 0;
    this._roundResolved = false;
    this._actionHint = "";
    this._lastHudKey = "";
    this.particles.clear();
    this.floatingTexts.clear();

    const count = this.mode === "versus" ? 2 : 1;
    this.players = [];
    for (let index = 0; index < count; index += 1) {
      const player = new Player(index, level.spawns[index] || { col: 1 + index * 3, row: 1 }, level, this.mode);
      player.setGame(this);
      if (this.mode === "campaign" && index === 0 && this.levelStartLoadout) {
        player.applyLoadout(this.levelStartLoadout);
      }
      player.invulnerable = 1.6 + index * 0.2;
      this.players.push(player);
    }

    for (const enemyData of level.enemies) {
      this.enemies.push(new Enemy(enemyData, level, this));
    }

    for (const pickup of level.pickups) {
      this.pickups.push({
        ...pickup,
        x: pickup.col + 0.5,
        y: pickup.row + 0.5,
        revealed: true,
        appear: 1,
        bobSeed: Math.random() * 10
      });
    }

    if (this.mode === "versus") {
      for (const player of this.players) {
        player.hearts = 1;
        player.maxHearts = 1;
      }
    }

    this.#emitPickupsToHud();
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  command(command) {
    if (!command || this.state !== "playing") return false;
    const player = this.players[command.player];
    if (!player?.alive) return false;
    switch (command.type) {
      case "bomb":
        return this.placeBomb(player);
      case "detonate":
        return this.detonate(player);
      case "action":
        return this.doAction(player);
      default:
        return false;
    }
  }

  placeBomb(player) {
    if (!player.alive || this.state !== "playing") return false;
    if (this.bombAt(Math.floor(player.x), Math.floor(player.y))) {
      this.audio.play("denied", { volume: 0.4 });
      return false;
    }
    const active = this.bombs.filter((bomb) => bomb.owner === player.index && !bomb.exploded);
    if (active.length >= player.maxBombs) {
      this.audio.play("denied", { volume: 0.35 });
      return false;
    }
    if (player.bombCooldown > 0) return false;
    const col = Math.floor(player.x);
    const row = Math.floor(player.y);
    const remote = player.hasPower("detonator");
    const bomb = {
      id: BOMB_ID++,
      owner: player.index,
      col,
      row,
      x: col + 0.5,
      y: row + 0.5,
      z: 0,
      seeded: Math.random() * 999,
      seed: Math.random() * 6.28,
      timer: remote ? REMOTE_FUSE : BOMB_FUSE,
      maxTimer: remote ? REMOTE_FUSE : BOMB_FUSE,
      placedAt: this.time,
      range: player.range,
      mode: remote ? "remote" : "normal",
      kind: remote ? "remote" : player.hasPower("proximity") ? "proximity" : "normal",
      proximity: player.hasPower("proximity"),
      exploded: false,
      kickDir: null,
      kickTarget: null,
      flight: null,
      ownerImmunity: player.hasPower("immunity"),
      trail: []
    };
    this.bombs.push(bomb);
    player.bombCooldown = 0.24;
    player.bombsPlaced += 1;
    this.bombsPlaced += 1;
    this.audio.play("place", { volume: 0.9 });
    this.particles.spawn(bomb.x, bomb.y + 0.16, 6, {
      color: this.level.palette.softTop,
      speed: 0.55,
      size: 0.03,
      life: 0.35,
      gravity: 0.6
    });
    this.floatingTexts.add(bomb.x, bomb.y - 0.36, "+", this.level.palette.accent, 0.35, 0.14);
    this.#emitHud(true);
    return true;
  }

  detonate(player) {
    if (!player.alive) return false;
    if (!player.hasPower("detonator")) {
      this.audio.play("denied", { volume: 0.4 });
      this.emitToast("Детонатор ещё не найден", "#ffd479", "Нужен бонус «Детонатор»");
      return false;
    }
    const own = this.bombs.filter((bomb) => bomb.owner === player.index && !bomb.exploded);
    if (!own.length) {
      this.audio.play("denied", { volume: 0.3 });
      return false;
    }
    this.audio.play("detonate", { volume: 0.7 });
    this.flashScreen(0.08, this.level.palette.gold);
    for (const bomb of own) {
      bomb.timer = 0;
      this.#detonateBomb(bomb);
    }
    return true;
  }

  doAction(player) {
    if (!player.alive) return false;
    const nearBomb = this.#nearestOwnBomb(player, 1.5);
    if (player.hasPower("throw") && nearBomb) {
      return this.throwBomb(player, nearBomb);
    }
    if (player.mount) return this.useMountAbility(player);
    if (nearBomb && !player.hasPower("throw")) {
      this.emitToast("Бомбомёт не найден", "#ffd479", "Найдите бонус «Бомбомёт»");
      this.audio.play("denied", { volume: 0.35 });
      return false;
    }
    this.audio.play("denied", { volume: 0.25 });
    this.emitToast("Действие недоступно", "#8ea0b4", "Подойдите к бомбе или найдите животное");
    return false;
  }

  throwBomb(player, bomb) {
    if (!bomb || bomb.exploded || bomb.flight || bomb.kickDir) return false;
    const dir = player.dir;
    if (!dir.x && !dir.y) return false;
    let landing = null;
    for (let step = 1; step <= 3; step += 1) {
      const col = bomb.col + dir.x * step;
      const row = bomb.row + dir.y * step;
      if (!this.isInside(col, row)) break;
      const tile = this.level.tiles[row * this.level.cols + col];
      const occupied = this.bombAt(col, row);
      if (tile === TILE.FLOOR && !occupied) {
        landing = { col, row };
      }
    }
    if (!landing) {
      this.audio.play("denied", { volume: 0.4 });
      this.emitToast("Некуда бросить", "#ffb18a", "Бомбомёт");
      return false;
    }
    bomb.flight = {
      fromX: bomb.x,
      fromY: bomb.y,
      toX: landing.col + 0.5,
      toY: landing.row + 0.5,
      t: 0,
      duration: 0.52
    };
    bomb.col = landing.col;
    bomb.row = landing.row;
    this.audio.play("throw", { volume: 0.8 });
    this.spawnParticles(bomb.x, bomb.y, 8, {
      color: this.level.palette.gold,
      speed: 0.9,
      size: 0.03,
      life: 0.45,
      additive: true
    });
    player.bombCooldown = 0.22;
    return true;
  }

  useMountAbility(player) {
    if (player.mountActionCooldown > 0) {
      this.audio.play("denied", { volume: 0.3 });
      return false;
    }
    const mount = player.mount;
    const def = MOUNTS[mount.key];
    if (!def) return false;
    if (mount.key === "drake") {
      player.mountActionCooldown = BREATH_COOLDOWN;
      this.audio.play("breath", { volume: 0.9 });
      const cells = [];
      const dir = player.dir;
      for (let step = 1; step <= 3; step += 1) {
        const col = Math.floor(player.x) + dir.x * step;
        const row = Math.floor(player.y) + dir.y * step;
        if (!this.isInside(col, row)) break;
        const tile = this.level.tiles[row * this.level.cols + col];
        if (tile === TILE.WALL) break;
        cells.push({ col, row });
        if (tile === TILE.BLOCK) {
          this.destroyBlock(col, row, player);
          break;
        }
      }
      if (cells.length) {
        const explosionCells = cells.map((cell) => ({
          col: cell.col,
          row: cell.row,
          x: cell.col + 0.5,
          y: cell.row + 0.5,
          seed: Math.random(),
          life: 0.45,
          maxLife: 0.45
        }));
        for (const enemy of this.enemies) {
          if (!enemy.alive) continue;
          if (cells.some((cell) => cell.col === Math.floor(enemy.x) && cell.row === Math.floor(enemy.y))) {
            enemy.lastHitBy = player.index;
            enemy.takeDamage(1, this, "dragon");
          }
        }
        this.explosions.push({
          cells: explosionCells,
          life: 0.45,
          maxLife: 0.45,
          x: player.x,
          y: player.y,
          owner: player.index,
          friendly: true,
          showRing: false
        });
        this.spawnParticles(player.x + dir.x * 0.6, player.y + dir.y * 0.3, 16, {
          color: this.level.palette.danger,
          color2: this.level.palette.gold,
          speed: 2.2,
          size: 0.045,
          life: 0.55,
          additive: true,
          shape: "spark",
          angle: Math.atan2(dir.y, dir.x),
          spread: 1.6
        });
      }
      return true;
    }
    if (mount.key === "roo") {
      player.mountActionCooldown = 2.4;
      const dir = player.dir;
      const startCol = Math.floor(player.x);
      const startRow = Math.floor(player.y);
      let target = null;
      for (let step = 1; step <= 2; step += 1) {
        const col = startCol + dir.x * step;
        const row = startRow + dir.y * step;
        if (!this.isInside(col, row)) break;
        if (this.isSolid(col, row, { ignoreSoft: false, ignoreWalls: false })) break;
        target = { col, row };
      }
      if (target) {
        player.setTile(target.col, target.row);
        player.invulnerable = Math.max(player.invulnerable, 0.55);
        this.spawnParticles(player.x, player.y + 0.2, 12, {
          color: this.level.palette.accent,
          speed: 1.1,
          size: 0.04,
          life: 0.5,
          gravity: 0.7
        });
        this.audio.play("throw", { volume: 0.5 });
        return true;
      }
      player.mountActionCooldown = 0.5;
      return false;
    }
    if (mount.key === "gloom") {
      player.mountActionCooldown = 3.4;
      this.revealTimer = 4;
      this.rings.push({
        x: player.x,
        y: player.y,
        startRadius: 0.2,
        radius: 6,
        color: this.level.palette.accent2,
        life: 0.9,
        maxLife: 0.9
      });
      this.audio.play("scanner", { volume: 0.9 });
      for (const enemy of this.enemies) {
        if (enemy.alive) enemy.revealedTimer = 4;
      }
      this.floatingTexts.add(player.x, player.y - 0.55, "СВЕТ", this.level.palette.accent2, 0.8, 0.16);
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(dt) {
    if (this.state !== "playing") return;
    dt = Math.min(dt, 0.035);
    this.time += dt;
    this.elapsed += dt;
    this.hudTimer += dt;
    this._time = this.time;
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 3.4);
    this.flash = Math.max(0, this.flash - dt * 5.2);
    this.revealTimer = Math.max(0, this.revealTimer - dt);
    if (this.portalActive) this.portalAppear = Math.min(1, this.portalAppear + dt * 2.1);

    for (const player of this.players) player.update(dt, this);
    if (this.state !== "playing") return;

    for (const enemy of this.enemies) {
      if (enemy.alive || enemy.dying > 0) enemy.update(dt, this);
    }
    if (this.state !== "playing") return;

    this.#updateBombs(dt);
    this.#updateExplosions(dt);
    this.#updateFireHazards(dt);
    this.#updateProjectiles(dt);
    this.#updatePickups(dt);
    this.particles.update(dt);
    this.floatingTexts.update(dt);
    this.#updateRings(dt);
    this.#cleanup();

    if (!this.portalActive && this.mode === "campaign" && this.enemies.every((enemy) => !enemy.alive)) {
      this.#openPortal();
    }

    this.#checkOutcome();
    this.#updateActionHint();
    if (this.hudTimer > 0.08) {
      this.hudTimer = 0;
      this.#emitHud();
    }
  }

  #updateBombs(dt) {
    const snapshot = [...this.bombs];
    for (const bomb of snapshot) {
      if (bomb.exploded) continue;
      if (bomb.flight) {
        bomb.flight.t += dt;
        const t = clamp(bomb.flight.t / bomb.flight.duration, 0, 1);
        const eased = 1 - Math.pow(1 - t, 2.2);
        bomb.x = bomb.flight.fromX + (bomb.flight.toX - bomb.flight.fromX) * eased;
        bomb.y = bomb.flight.fromY + (bomb.flight.toY - bomb.flight.fromY) * eased;
        bomb.z = Math.sin(t * Math.PI) * 0.62;
        if (t >= 1) {
          bomb.x = bomb.flight.toX;
          bomb.y = bomb.flight.toY;
          bomb.z = 0;
          bomb.flight = null;
          this.particles.spawn(bomb.x, bomb.y + 0.2, 8, {
            color: this.level.palette.softTop,
            speed: 0.7,
            size: 0.03,
            life: 0.45,
            gravity: 1
          });
        }
      } else if (bomb.kickDir) {
        this.#updateKickedBomb(bomb, dt);
      }

      bomb.timer -= dt;
      if (bomb.mode === "proximity" || bomb.proximity) {
        const triggerRadius = 1.15;
        const targets = [
          ...this.players.filter((p) => p.alive).map((p) => ({ x: p.x, y: p.y })),
          ...this.enemies.filter((e) => e.alive && e.dangerous).map((e) => ({ x: e.x, y: e.y }))
        ];
        if (targets.some((target) => dist(bomb.x, bomb.y, target.x, target.y) < triggerRadius)) {
          bomb.timer = Math.min(bomb.timer, 0.16);
        }
      }
      if (bomb.mode === "remote") {
        // Remote bombs wait for the detonator. A generous safety fuse prevents
        // an abandoned bomb from staying in the arena forever.
        if (this.time - (bomb.placedAt || 0) > 75) bomb.timer = 0.1;
        else bomb.timer = Math.max(bomb.timer, 0.3);
      }
      if (bomb.timer <= 0) this.#detonateBomb(bomb);
    }
  }

  #updateKickedBomb(bomb, dt) {
    if (!bomb.kickDir) return;
    if (!bomb.kickTarget) {
      const nextCol = bomb.col + bomb.kickDir.x;
      const nextRow = bomb.row + bomb.kickDir.y;
      if (!this.isInside(nextCol, nextRow) || this.isSolid(nextCol, nextRow, { ignoreSoft: false, ignoreWalls: false }) || this.bombAt(nextCol, nextRow)) {
        bomb.kickDir = null;
        bomb.x = bomb.col + 0.5;
        bomb.y = bomb.row + 0.5;
        return;
      }
      bomb.kickTarget = { col: nextCol, row: nextRow };
    }
    const tx = bomb.kickTarget.col + 0.5;
    const ty = bomb.kickTarget.row + 0.5;
    const dx = tx - bomb.x;
    const dy = ty - bomb.y;
    const d = Math.hypot(dx, dy);
    const step = BOMB_KICK_SPEED * dt;
    if (d <= step) {
      bomb.x = tx;
      bomb.y = ty;
      bomb.col = bomb.kickTarget.col;
      bomb.row = bomb.kickTarget.row;
      bomb.kickTarget = null;
      this.particles.spawn(bomb.x, bomb.y + 0.17, 2, {
        color: this.level.palette.accent,
        speed: 0.25,
        size: 0.02,
        life: 0.3
      });
    } else {
      bomb.x += (dx / d) * step;
      bomb.y += (dy / d) * step;
    }
  }

  #detonateBomb(bomb) {
    if (!bomb || bomb.exploded) return;
    bomb.exploded = true;
    const index = this.bombs.indexOf(bomb);
    if (index >= 0) this.bombs.splice(index, 1);
    const cells = [];
    const seen = new Set();
    const addCell = (col, row) => {
      const key = `${col},${row}`;
      if (seen.has(key)) return;
      if (!this.isInside(col, row)) return;
      seen.add(key);
      cells.push({
        col,
        row,
        x: col + 0.5,
        y: row + 0.5,
        seed: Math.random(),
        life: 0.62,
        maxLife: 0.62
      });
    };
    addCell(bomb.col, bomb.row);
    if (this.level.tiles[bomb.row * this.level.cols + bomb.col] === TILE.BLOCK) {
      this.destroyBlock(bomb.col, bomb.row, this.players[bomb.owner]);
    }
    for (const dir of DIRECTIONS) {
      for (let step = 1; step <= bomb.range; step += 1) {
        const col = bomb.col + dir.x * step;
        const row = bomb.row + dir.y * step;
        if (!this.isInside(col, row)) break;
        const tile = this.level.tiles[row * this.level.cols + col];
        if (tile === TILE.WALL) break;
        addCell(col, row);
        if (tile === TILE.BLOCK) {
          this.destroyBlock(col, row, this.players[bomb.owner]);
          break;
        }
      }
    }

    const owner = this.players[bomb.owner];
    this.explosions.push({
      cells,
      life: 0.68,
      maxLife: 0.68,
      x: bomb.x,
      y: bomb.y,
      owner: bomb.owner,
      friendly: false,
      showRing: true
    });

    // Damage players.
    for (const player of this.players) {
      if (!player.alive || player.invulnerable > 0) continue;
      if (player.hasPower("immunity") && bomb.owner === player.index) continue;
      const pCol = Math.floor(player.x);
      const pRow = Math.floor(player.y);
      if (cells.some((cell) => cell.col === pCol && cell.row === pRow)) {
        this.hurtPlayer(player, { source: "explosion", bombOwner: bomb.owner, bomb });
      }
    }

    // Damage enemies.
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const eCol = Math.floor(enemy.x);
      const eRow = Math.floor(enemy.y);
      if (cells.some((cell) => cell.col === eCol && cell.row === eRow)) {
        enemy.lastHitBy = bomb.owner;
        enemy.takeDamage(1, this, "bomb");
      }
    }

    // Chain reactions.
    const chained = this.bombs.filter((other) => {
      if (other.exploded || other === bomb) return false;
      return cells.some((cell) => cell.col === other.col && cell.row === other.row);
    });
    for (const other of chained) this.#detonateBomb(other);

    const intensity = 1 + Math.min(0.8, bomb.range * 0.12);
    this.particles.explosion(bomb.x, bomb.y, this.level.palette, intensity);
    this.shake(Math.min(0.55, 0.22 + bomb.range * 0.025));
    this.flashScreen(0.08 + bomb.range * 0.012, this.level.palette.gold);
    this.audio.play("explosion", { volume: 0.95, throttle: 0.045, big: bomb.range >= 3 });
    if (owner) owner.bombsPlaced += 0; // keep player stats object warm
    this.#emitHud(true);
  }

  #updateExplosions(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i -= 1) {
      const explosion = this.explosions[i];
      explosion.life -= dt;
      for (const cell of explosion.cells) cell.life -= dt;
      const newest = explosion.cells[explosion.cells.length - 1];
      if (newest) {
        const maxLife = Math.max(0.0001, newest.maxLife);
        // Keep the newest cell alive longest for a natural bloom.
        if (newest.life < 0) newest.life = 0;
      }
      if (explosion.life <= 0) this.explosions.splice(i, 1);
    }
  }

  #updateFireHazards(dt) {
    for (let i = this.fireHazards.length - 1; i >= 0; i -= 1) {
      const fire = this.fireHazards[i];
      fire.life -= dt;
      if (fire.life <= 0) {
        this.fireHazards.splice(i, 1);
        continue;
      }
      for (const player of this.players) {
        if (!player.alive || player.invulnerable > 0) continue;
        if (Math.floor(player.x) === fire.col && Math.floor(player.y) === fire.row) {
          this.hurtPlayer(player, { source: "fire", enemy: fire.enemy });
        }
      }
    }
  }

  #updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.life -= dt;
      const nx = projectile.x + projectile.vx * dt;
      const ny = projectile.y + projectile.vy * dt;
      if (projectile.life <= 0 || !this.isInside(Math.floor(nx), Math.floor(ny))) {
        this.projectiles.splice(i, 1);
        continue;
      }
      const tile = this.level.tiles[Math.floor(ny) * this.level.cols + Math.floor(nx)];
      if (tile === TILE.WALL || tile === TILE.BLOCK) {
        this.particles.spawn(nx, ny, 5, {
          color: this.level.palette.accent2,
          speed: 0.6,
          size: 0.03,
          life: 0.35,
          additive: true
        });
        this.projectiles.splice(i, 1);
        continue;
      }
      projectile.x = nx;
      projectile.y = ny;
      for (const player of this.players) {
        if (!player.alive || player.invulnerable > 0) continue;
        if (dist(nx, ny, player.x, player.y) < player.radius + 0.16) {
          this.hurtPlayer(player, { source: "projectile" });
          this.projectiles.splice(i, 1);
          break;
        }
      }
    }
  }

  #updatePickups(dt) {
    for (const player of this.players) {
      if (!player.alive || !player.hasPower("magnet")) continue;
      for (const pickup of this.pickups) {
        if (!pickup.revealed) continue;
        const d = dist(player.x, player.y, pickup.x, pickup.y);
        if (d > 3.1 || d < 0.4) continue;
        if (!this.hasLineOfSight(player.x, player.y, pickup.x, pickup.y)) continue;
        const step = 2.4 * dt;
        pickup.x += ((player.x - pickup.x) / d) * step;
        pickup.y += ((player.y - pickup.y) / d) * step;
        if (Math.random() < dt * 8) {
          this.particles.spawn(pickup.x, pickup.y, 1, {
            color: POWERUPS[pickup.type]?.color || "#ffffff",
            speed: 0.2,
            size: 0.018,
            life: 0.4,
            additive: true
          });
        }
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = this.pickups[i];
      if (pickup.appear !== undefined && pickup.appear < 1) {
        pickup.appear = Math.min(1, pickup.appear + dt * 4.5);
      }
      if (!pickup.revealed) continue;
      for (const player of this.players) {
        if (!player.alive) continue;
        if (dist(player.x, player.y, pickup.x, pickup.y) < 0.5) {
          this.collectPickup(player, pickup, i);
          break;
        }
      }
    }
  }

  #updateRings(dt) {
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const ring = this.rings[i];
      ring.life -= dt;
      if (ring.life <= 0) this.rings.splice(i, 1);
    }
  }

  #cleanup() {
    this.enemies = this.enemies.filter((enemy) => enemy.alive || enemy.dying > 0);
    this.projectiles = this.projectiles.filter((projectile) => projectile.life > 0);
  }

  #updateActionHint() {
    const player = this.players[0];
    if (!player?.alive) {
      this._actionHint = "";
      return;
    }
    if (this.portalActive) {
      this._actionHint = "Войдите во врата";
      return;
    }
    const nearBomb = this.#nearestOwnBomb(player, 1.5);
    if (nearBomb && player.hasPower("throw")) this._actionHint = "Действие: бросок";
    else if (player.mount) this._actionHint = `Действие: ${MOUNTS[player.mount.key]?.abilityName || "способность"}`;
    else if (player.hasPower("throw")) this._actionHint = "Подойдите к бомбе";
    else this._actionHint = "";
  }

  // -------------------------------------------------------------------------
  // Collision, damage, level events
  // -------------------------------------------------------------------------

  isInside(col, row) {
    return col > 0 && row > 0 && col < this.level.cols - 1 && row < this.level.rows - 1;
  }

  isSolid(col, row, { ignoreSoft = false, ignoreWalls = false } = {}) {
    if (!this.isInside(col, row)) return true;
    const tile = this.level.tiles[row * this.level.cols + col];
    if (tile === TILE.WALL && !ignoreWalls) return true;
    if (tile === TILE.BLOCK && !ignoreSoft) return true;
    return false;
  }

  isEnemyWalkable(col, row, { avoidBombs = true, ignoreAll = false, ignoreSoft = false } = {}) {
    if (!this.isInside(col, row)) return false;
    if (ignoreAll) return true;
    const tile = this.level.tiles[row * this.level.cols + col];
    if (tile === TILE.WALL) return false;
    if (tile === TILE.BLOCK && !ignoreSoft) return false;
    if (avoidBombs && this.bombAt(col, row)) return false;
    return true;
  }

  isLandingCell(col, row) {
    if (!this.isInside(col, row)) return false;
    const tile = this.level.tiles[row * this.level.cols + col];
    if (tile === TILE.WALL || tile === TILE.BLOCK) return false;
    return !this.bombAt(col, row);
  }

  hasLineOfSight(x1, y1, x2, y2) {
    // Supercover line on the tile grid; monoliths block the magnet, soft blocks
    // and bombs do not.
    let x = Math.floor(x1);
    let y = Math.floor(y1);
    const targetX = Math.floor(x2);
    const targetY = Math.floor(y2);
    const dx = Math.abs(targetX - x);
    const dy = Math.abs(targetY - y);
    const sx = Math.sign(targetX - x);
    const sy = Math.sign(targetY - y);
    let error = dx - dy;
    let guard = 0;
    while ((x !== targetX || y !== targetY) && guard < 30) {
      guard += 1;
      const e2 = 2 * error;
      if (e2 > -dy) {
        error -= dy;
        x += sx;
      }
      if (e2 < dx) {
        error += dx;
        y += sy;
      }
      if (x === targetX && y === targetY) break;
      if (!this.isInside(x, y)) return false;
      if (this.level.tiles[y * this.level.cols + x] === TILE.WALL) return false;
    }
    return true;
  }

  bombAt(col, row) {
    return this.bombs.some(
      (bomb) => !bomb.exploded && !bomb.flight && bomb.col === col && bomb.row === row
    );
  }

  canPlayerEnterCell(player, col, row) {
    if (!this.isInside(col, row)) return false;
    const tile = this.level.tiles[row * this.level.cols + col];
    if (tile === TILE.WALL) return false;
    if (tile === TILE.BLOCK && !player.hasPower("wallpass")) return false;
    // Only the destination cell matters. A bomb under the player's feet never
    // blocks them from starting a step toward a free neighbouring cell.
    if (this.bombAt(col, row)) return false;
    return true;
  }

  #playerOverlapsBomb(player, bomb) {
    const r = player.radius - 0.025;
    return (
      player.x + r > bomb.col &&
      player.x - r < bomb.col + 1 &&
      player.y + r > bomb.row &&
      player.y - r < bomb.row + 1
    );
  }

  #movingAwayFromBomb(player, bomb, nx, ny) {
    const moveX = nx - player.x;
    const moveY = ny - player.y;
    const bombX = bomb.x - player.x;
    const bombY = bomb.y - player.y;
    // Once the bomb is under the player's body, movement that does not go
    // deeper into the bomb is allowed. This is what lets a player walk out of
    // a freshly placed bomb instead of getting stuck on its tile edge.
    return moveX * bombX + moveY * bombY <= 0.0001;
  }

  getBlockingBomb(player, nx, ny) {
    const r = player.radius;
    const minCol = Math.floor(nx - r + 0.025);
    const maxCol = Math.floor(nx + r - 0.025);
    const minRow = Math.floor(ny - r + 0.025);
    const maxRow = Math.floor(ny + r - 0.025);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const bomb = this.bombs.find(
          (candidate) => !candidate.exploded && !candidate.flight && candidate.col === col && candidate.row === row
        );
        if (!bomb) continue;
        if (this.#playerOverlapsBomb(player, bomb) && this.#movingAwayFromBomb(player, bomb, nx, ny)) continue;
        return bomb;
      }
    }
    return null;
  }

  canPlayerOccupy(player, nx, ny) {
    const r = player.radius;
    if (nx - r < 1 || ny - r < 1 || nx + r > this.level.cols - 1 || ny + r > this.level.rows - 1) return false;
    const minCol = Math.floor(nx - r + 0.02);
    const maxCol = Math.floor(nx + r - 0.02);
    const minRow = Math.floor(ny - r + 0.02);
    const maxRow = Math.floor(ny + r - 0.02);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const tile = this.level.tiles[row * this.level.cols + col];
        if (tile === TILE.WALL) return false;
        if (tile === TILE.BLOCK && !player.hasPower("wallpass")) return false;
        const blockingBomb = this.bombs.find(
          (bomb) => !bomb.exploded && !bomb.flight && bomb.col === col && bomb.row === row
        );
        if (blockingBomb) {
          if (
            this.#playerOverlapsBomb(player, blockingBomb) &&
            this.#movingAwayFromBomb(player, blockingBomb, nx, ny)
          ) {
            continue;
          }
          return false;
        }
      }
    }
    return true;
  }

  kickBomb(bomb, dir, player) {
    if (!bomb || bomb.exploded || bomb.flight || !player.hasPower("kick")) return false;
    if (bomb.kickDir) return false;
    if (!dir.x && !dir.y) return false;
    const nextCol = bomb.col + dir.x;
    const nextRow = bomb.row + dir.y;
    if (!this.isInside(nextCol, nextRow) || this.isSolid(nextCol, nextRow, { ignoreSoft: false, ignoreWalls: false })) return false;
    if (this.bombAt(nextCol, nextRow)) return false;
    bomb.kickDir = { x: Math.sign(dir.x), y: Math.sign(dir.y) };
    bomb.kickTarget = null;
    this.audio.play("kick", { volume: 0.75 });
    this.particles.spawn(bomb.x, bomb.y + 0.2, 5, {
      color: this.level.palette.softTop,
      speed: 0.7,
      size: 0.03,
      life: 0.4
    });
    return true;
  }

  hurtPlayer(player, { source = "enemy", enemy = null, bomb = null } = {}) {
    if (!player.alive || player.invulnerable > 0) return false;
    if (source === "explosion" && bomb && player.hasPower("immunity") && bomb.owner === player.index) return false;

    // Mounts take the first hit from any source.
    if (player.mount) {
      player.removeMount(this);
      player.invulnerable = 1.6;
      this.audio.play("armorHit", { volume: 0.95 });
      this.flashScreen(0.1, "#ffd479");
      this.shake(0.2);
      this.emitToast("Животное спасло вас", "#ffd479", "Питомец");
      return false;
    }

    // Armor is specifically an enemy-contact shield.
    if (source === "enemy" && player.armor > 0) {
      player.armor -= 1;
      player.invulnerable = 1.6;
      player.hurtFlash = 0.8;
      this.audio.play("armorHit", { volume: 0.95 });
      this.flashScreen(0.06, "#d8efff");
      this.shake(0.15);
      this.particles.spawn(player.x, player.y, 14, {
        color: "#d9efff",
        speed: 1.3,
        size: 0.035,
        life: 0.55,
        additive: true
      });
      this.emitToast("Доспехи выдержали удар", "#d8efff", "Броня −1");
      return false;
    }

    player.hearts -= 1;
    player.hurtFlash = 1;
    player.invulnerable = 2.1;
    this.flashScreen(0.2, "#ff4b62");
    this.shake(0.34);
    this.audio.play("hurt", { volume: 1 });
    this.particles.spawn(player.x, player.y, 18, {
      color: "#ff6e7d",
      color2: "#ffe1a6",
      speed: 1.8,
      size: 0.045,
      life: 0.65,
      gravity: 0.8,
      additive: true
    });
    this.floatingTexts.add(player.x, player.y - 0.55, source === "explosion" ? "ОГОНЬ!" : "УДАР!", "#ff7f8e", 0.9, 0.18);
    if (player.hearts <= 0) {
      player.hearts = 0;
      player.alive = false;
      player.deadTimer = 0;
      this.#onPlayerEliminated(player);
    } else if (this.mode === "campaign") {
      this.#respawnPlayer(player);
    }
    this.#emitHud(true);
    return true;
  }

  #respawnPlayer(player) {
    const spawn = this.level.spawns[player.index] || this.level.spawns[0];
    // A lost life resets the player to the (always cleared) spawn tile. Their
    // placed bombs are removed so the respawn can never be a coin flip.
    for (let index = this.bombs.length - 1; index >= 0; index -= 1) {
      const bomb = this.bombs[index];
      if (bomb.owner === player.index) {
        this.particles.spawn(bomb.x, bomb.y, 4, {
          color: this.level.palette.danger,
          speed: 0.4,
          size: 0.025,
          life: 0.35
        });
        this.bombs.splice(index, 1);
      }
    }
    player.setTile(spawn.col, spawn.row);
    player.dir = { x: player.index === 0 ? 1 : -1, y: 0 };
    player.bombCooldown = 0.45;
    player.invulnerable = Math.max(player.invulnerable, 2.4);
    this.rings.push({
      x: player.x,
      y: player.y,
      startRadius: 0.15,
      radius: 1.2,
      color: this.level.palette.accent,
      life: 0.65,
      maxLife: 0.65
    });
    this.particles.spawn(player.x, player.y, 16, {
      color: this.level.palette.accent,
      color2: "#ffffff",
      speed: 1.3,
      size: 0.04,
      life: 0.7,
      additive: true,
      shape: "spark"
    });
    this.floatingTexts.add(player.x, player.y - 0.55, "ВОЗРОЖДЕНИЕ", this.level.palette.accent, 1.1, 0.15);
    this.emitToast("Потеряно сердце", "#ff9a9a", "Возрождение на старте");
  }

  #onPlayerEliminated(player) {
    this.particles.spawn(player.x, player.y, 24, {
      color: this.level.palette.danger,
      color2: this.level.palette.gold,
      speed: 2.1,
      size: 0.05,
      life: 0.9,
      gravity: 0.5,
      additive: true,
      shape: "spark"
    });
    // The outcome sound and overlay are resolved at the end of the update,
    // after every blast cell and both players have been processed.
  }

  collectPickup(player, pickup, index) {
    if (!pickup || pickup.collected) return;
    pickup.collected = true;
    if (typeof index === "number" && index >= 0) this.pickups.splice(index, 1);
    else {
      const at = this.pickups.indexOf(pickup);
      if (at >= 0) this.pickups.splice(at, 1);
    }
    const def = POWERUPS[pickup.type] || POWERUPS.bomb;
    player.addPowerup(pickup.type);
    player.pickupsCollected += 1;
    const points = def.rarity === "legendary" ? 300 : def.rarity === "epic" ? 180 : 100;
    player.score += points;
    this.score += points;
    this.particles.pickup(pickup.x, pickup.y, def.color);
    this.rings.push({
      x: pickup.x,
      y: pickup.y,
      startRadius: 0.15,
      radius: 0.9,
      color: def.color,
      life: 0.55,
      maxLife: 0.55
    });
    this.floatingTexts.add(pickup.x, pickup.y - 0.4, def.name, def.color, 1.15, 0.17);
    this.audio.play(def.rarity === "legendary" ? "rare" : "pickup", { volume: 0.9 });
    this.emitToast(def.name, def.color, def.short);
    this.#emitHud(true);
  }

  hatchEgg(player, egg) {
    if (this.mountEggUsed) return;
    const def = MOUNTS[egg.type];
    this.mountEggUsed = true;
    player.mountCreature(egg.type, this);
    this.emitToast(`Вы оседлали ${def.name}`, def.color, def.short);
    this.particles.spawn(egg.col + 0.5, egg.row + 0.5, 18, {
      color: def.color,
      speed: 1.3,
      size: 0.045,
      life: 0.8,
      additive: true
    });
    this.#emitHud(true);
  }

  destroyBlock(col, row, player = null) {
    if (!this.isInside(col, row)) return false;
    const index = row * this.level.cols + col;
    if (this.level.tiles[index] !== TILE.BLOCK) return false;
    this.level.tiles[index] = TILE.FLOOR;
    this.blocksDestroyed += 1;
    if (player) player.blocksDestroyed += 1;
    if (player) player.score += 15;
    this.score += 15;
    this.particles.blockBreak(col + 0.5, row + 0.5, this.level.palette);
    this.audio.play("enemyDeath", { volume: 0.35, throttle: 0.04 });
    const hiddenIndex = this.level.hiddenPickups.findIndex(
      (hidden) => hidden.col === col && hidden.row === row
    );
    if (hiddenIndex >= 0) {
      const hidden = this.level.hiddenPickups.splice(hiddenIndex, 1)[0];
      const pickup = {
        ...hidden,
        x: col + 0.5,
        y: row + 0.5,
        revealed: true,
        appear: 0.01,
        bobSeed: Math.random() * 10
      };
      this.pickups.push(pickup);
      this.rings.push({
        x: pickup.x,
        y: pickup.y,
        startRadius: 0.1,
        radius: 0.65,
        color: POWERUPS[pickup.type]?.color || "#fff",
        life: 0.5,
        maxLife: 0.5
      });
      this.audio.play("pickup", { volume: 0.35 });
    }
    return true;
  }

  spawnTurretBurst(turret) {
    this.audio.play("turret", { volume: 0.7, throttle: 0.04 });
    for (const dir of DIRECTIONS) {
      this.projectiles.push({
        x: turret.x + dir.x * 0.32,
        y: turret.y + dir.y * 0.32,
        vx: dir.x * 4.2,
        vy: dir.y * 4.2,
        life: 4.2,
        seed: Math.random() * 10,
        color: this.level.palette.accent2
      });
    }
    this.spawnParticles(turret.x, turret.y, 10, {
      color: this.level.palette.accent2,
      speed: 1.1,
      size: 0.03,
      life: 0.4,
      additive: true
    });
    this.shake(0.08);
  }

  addFireTrail(col, row, enemy) {
    if (!this.isInside(col, row)) return;
    if (this.fireHazards.some((fire) => fire.col === col && fire.row === row && fire.enemy === enemy)) return;
    const owned = this.fireHazards.filter((fire) => fire.enemy === enemy);
    if (owned.length >= 3) {
      const oldest = owned[0];
      const index = this.fireHazards.indexOf(oldest);
      if (index >= 0) this.fireHazards.splice(index, 1);
    }
    this.fireHazards.push({
      col,
      row,
      x: col + 0.5,
      y: row + 0.5,
      life: 2.7,
      maxLife: 2.7,
      seed: Math.random() * 10,
      enemy
    });
  }

  openPortal() {
    this.#openPortal();
  }

  #openPortal() {
    if (this.portalActive) return;
    this.portalActive = true;
    this.portalAppear = 0;
    this.audio.play("portal", { volume: 0.9 });
    this.flashScreen(0.12, this.level.palette.accent);
    this.emitToast("Врата открыты", this.level.palette.accent, "Доберитесь до выхода");
    if (this.level.exit) {
      this.particles.spawn(this.level.exit.col + 0.5, this.level.exit.row + 0.5, 24, {
        color: this.level.palette.accent,
        color2: this.level.palette.accent2,
        speed: 1.5,
        size: 0.04,
        life: 1.1,
        additive: true,
        shape: "spark"
      });
      this.rings.push({
        x: this.level.exit.col + 0.5,
        y: this.level.exit.row + 0.5,
        startRadius: 0.2,
        radius: 2.2,
        color: this.level.palette.accent,
        life: 1.1,
        maxLife: 1.1
      });
    }
    this.#emitHud(true);
  }

  enterPortal(player) {
    if (this.mode !== "campaign" || this.state !== "playing") return;
    if (!this.portalActive) return;
    this.completeLevel();
  }

  completeLevel() {
    if (this.state !== "playing") return;
    this.state = "levelComplete";
    this.input.setEnabled(false);
    const player = this.players[0];
    const time = this.elapsed;
    const par = STAR_THRESHOLDS.par(this.levelNumber);
    const great = STAR_THRESHOLDS.great(this.levelNumber);
    const stars = time <= par ? 3 : time <= great ? 2 : 1;
    const timeBonus = Math.max(0, Math.round(par * 18 - time * 7));
    this.score += timeBonus;
    player.score += timeBonus;
    this.audio.stopMusic(0.25);
    this.audio.play("levelComplete", { volume: 1 });
    this.flashScreen(0.22, this.level.palette.accent);
    this.rings.push({
      x: player.x,
      y: player.y,
      startRadius: 0.2,
      radius: 5,
      color: this.level.palette.accent,
      life: 1.2,
      maxLife: 1.2
    });
    this.particles.spawn(this.level.exit.col + 0.5, this.level.exit.row + 0.5, 40, {
      color: this.level.palette.accent,
      color2: this.level.palette.gold,
      speed: 2.2,
      size: 0.05,
      life: 1.4,
      additive: true,
      shape: "spark"
    });
    const result = {
      level: this.levelNumber,
      score: this.score,
      time,
      stars,
      par,
      timeBonus,
      kills: this.kills,
      blocks: this.blocksDestroyed,
      bombs: this.bombsPlaced,
      pickups: player.pickupsCollected,
      totalLevels: TOTAL_LEVELS,
      loadout: player.getLoadout()
    };
    this.callbacks.onLevelComplete?.(result, this);
    this.#emitHud(true);
  }

  #checkOutcome() {
    if (this.state !== "playing") return;
    if (this.mode === "versus") {
      const alive = this.players.filter((player) => player.alive);
      if (alive.length <= 1 && !this._roundResolved) {
        this._roundResolved = true;
        this.state = "roundOver";
        this.input.setEnabled(false);
        let winner = alive.length === 1 ? alive[0].index : -1;
        const result = {
          winner,
          round: this.round,
          time: this.elapsed,
          reason: winner === -1 ? "draw" : "elimination"
        };
        this.audio.stopMusic(0.3);
        this.audio.play(winner === -1 ? "gameOver" : "levelComplete", { volume: 0.8 });
        this.callbacks.onVersusRoundEnd?.(result, this);
      } else if (this.elapsed >= VERSUS_LIMIT && !this._roundResolved) {
        this._roundResolved = true;
        this.state = "roundOver";
        this.input.setEnabled(false);
        this.callbacks.onVersusRoundEnd?.({ winner: -1, round: this.round, time: this.elapsed, reason: "time" }, this);
      }
      return;
    }

    const player = this.players[0];
    if (!player.alive && this.state === "playing" && !this._roundResolved) {
      this._roundResolved = true;
      this.state = "gameOver";
      this.input.setEnabled(false);
      this.audio.stopMusic(0.25);
      this.audio.play("gameOver", { volume: 0.9 });
      const result = {
        level: this.levelNumber,
        score: this.score,
        time: this.elapsed,
        kills: this.kills,
        blocks: this.blocksDestroyed,
        bombs: this.bombsPlaced
      };
      this.callbacks.onGameOver?.(result, this);
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  spawnParticles(x, y, count, options = {}) {
    this.particles.spawn(x, y, count, options);
  }

  floatText(x, y, text, color = "#ffffff", life = 1, size = 0.18) {
    this.floatingTexts.add(x, y, text, color, life, size);
  }

  shake(amount) {
    if (this.shakeEnabled === false) return;
    this.shakeAmount = Math.max(this.shakeAmount, clamp(amount, 0, 1));
  }

  flashScreen(amount, color = "#ffffff") {
    this.flash = Math.max(this.flash, clamp(amount, 0, 1));
    this.flashColor = color;
  }

  emitToast(text, color = "#61f7c8", accent = "") {
    const now = performance.now();
    if (this._lastToast.text === text && now - this._lastToast.at < 700) return;
    this._lastToast = { text, at: now };
    this.callbacks.onToast?.({ text, color, accent });
  }

  getNearestPlayer(x, y) {
    let best = null;
    let bestDistance = Infinity;
    for (const player of this.players) {
      if (!player.alive) continue;
      const d = dist(x, y, player.x, player.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = player;
      }
    }
    return best;
  }

  #nearestOwnBomb(player, maxDistance) {
    let best = null;
    let bestDistance = maxDistance;
    for (const bomb of this.bombs) {
      if (bomb.owner !== player.index || bomb.exploded || bomb.flight || bomb.kickDir) continue;
      const d = dist(player.x, player.y, bomb.x, bomb.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = bomb;
      }
    }
    return best;
  }

  /**
   * Breadth-first pathing over the tile grid. Returns the next tile from the
   * start toward the goal, or null when no route exists.
   */
  pathNext(startCol, startRow, goalCol, goalRow, options = {}) {
    const { avoidBombs = true, ignoreAll = false, maxSteps = 60 } = options;
    if (!this.level) return null;
    if (!this.isInside(startCol, startRow) || !this.isInside(goalCol, goalRow)) return null;
    if (startCol === goalCol && startRow === goalRow) return null;
    const cols = this.level.cols;
    const rows = this.level.rows;
    const total = cols * rows;
    const visited = new Uint8Array(total);
    const parent = new Int32Array(total).fill(-1);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;
    const start = startRow * cols + startCol;
    const goal = goalRow * cols + goalCol;
    queue[tail++] = start;
    visited[start] = 1;
    let found = false;
    let steps = 0;
    while (head < tail && steps < total) {
      const current = queue[head++];
      steps += 1;
      if (current === goal) {
        found = true;
        break;
      }
      const cx = current % cols;
      const cy = Math.floor(current / cols);
      for (const dir of DIRECTIONS) {
        const nx = cx + dir.x;
        const ny = cy + dir.y;
        if (!this.isInside(nx, ny)) continue;
        const ni = ny * cols + nx;
        if (visited[ni]) continue;
        if (!this.isEnemyWalkable(nx, ny, { avoidBombs, ignoreAll })) continue;
        visited[ni] = 1;
        parent[ni] = current;
        queue[tail++] = ni;
        if (tail >= total) break;
      }
    }
    if (!found) return null;
    let node = goal;
    let first = node;
    let guard = 0;
    while (parent[node] !== -1 && parent[node] !== start && guard < maxSteps) {
      node = parent[node];
      first = node;
      guard += 1;
    }
    if (parent[node] === start) first = node;
    return { col: first % cols, row: Math.floor(first / cols) };
  }

  getActionHint(player = this.players[0]) {
    if (!player) return "";
    const near = this.#nearestOwnBomb(player, 1.5);
    if (near && player.hasPower("throw")) return "Бросок бомбы";
    if (player.mount) return MOUNTS[player.mount.key]?.abilityName || "Способность";
    return "";
  }

  getEnemiesRemaining() {
    return this.enemies.filter((enemy) => enemy.alive).length;
  }

  #emitPickupsToHud() {
    this.callbacks.onPickups?.(this.pickups);
  }

  #emitHud(force = false) {
    const player = this.players[0];
    const p2 = this.players[1];
    const hud = {
      mode: this.mode,
      state: this.state,
      level: this.levelNumber,
      levelName: this.level?.name || "",
      palette: this.level?.palette || null,
      time: this.elapsed,
      timeLabel: formatTime(this.elapsed),
      score: this.score,
      kills: this.kills,
      blocks: this.blocksDestroyed,
      bombsPlaced: this.bombsPlaced,
      enemiesRemaining: this.getEnemiesRemaining(),
      portalActive: this.portalActive,
      actionHint: this._actionHint,
      player: player
        ? {
            alive: player.alive,
            hearts: player.hearts,
            maxHearts: player.maxHearts,
            armor: player.armor,
            mount: player.mount?.key || null,
            range: player.range,
            maxBombs: player.maxBombs,
            bombsActive: this.bombs.filter((bomb) => bomb.owner === 0).length,
            speed: player.speed,
            powers: [...player.powers],
            powerLevels: { ...player.powerLevels },
            canPlaceBomb: player.canPlaceBomb,
            hasDetonator: player.hasPower("detonator")
          }
        : null,
      p2: p2
        ? {
            alive: p2.alive,
            hearts: p2.hearts,
            maxHearts: p2.maxHearts,
            armor: p2.armor,
            mount: p2.mount?.key || null
          }
        : null,
      versusScore: { ...this.versusScore },
      round: this.round
    };
    const key = `${hud.state}|${hud.enemiesRemaining}|${hud.player?.hearts}|${hud.player?.armor}|${hud.player?.maxBombs}|${hud.player?.range}|${hud.player?.mount}|${hud.portalActive}|${hud.actionHint}|${hud.versusScore.p1}:${hud.versusScore.p2}|${hud.score}`;
    if (!force && key === this._lastHudKey) return;
    this._lastHudKey = key;
    this.callbacks.onHud?.(hud, this);
  }

  // -------------------------------------------------------------------------
  // Enemy callbacks
  // -------------------------------------------------------------------------

  onEnemyKilled(enemy) {
    if (!enemy || enemy._scored) return;
    enemy._scored = true;
    this.kills += 1;
    const owner = this.players[enemy.lastHitBy] || this.players[0];
    if (owner) {
      owner.kills += 1;
      owner.score += enemy.bounty;
    }
    this.score += enemy.bounty;
    this.particles.enemyDeath(enemy.x, enemy.y, enemy.def.color, this.level.palette);
    this.floatingTexts.add(enemy.x, enemy.y - 0.38, `+${enemy.bounty}`, this.level.palette.gold, 0.9, 0.17);
    this.audio.play("enemyDeath", { volume: 0.7, throttle: 0.04 });
    this.shake(0.1);

    if (enemy.type === "splitter") {
      const spots = [];
      for (const dir of DIRECTIONS) {
        const col = Math.floor(enemy.x) + dir.x;
        const row = Math.floor(enemy.y) + dir.y;
        if (this.isEnemyWalkable(col, row, { avoidBombs: true })) spots.push({ col, row });
      }
      for (const spot of spots.slice(0, 2)) {
        const mini = new Enemy(
          {
            type: "mini",
            col: spot.col,
            row: spot.row,
            seed: Math.floor(Math.random() * 1e9),
            variant: 0,
            parent: enemy
          },
          this.level,
          this
        );
        mini.speed = 1.75 * this.level.difficulty;
        mini.baseSpeed = mini.speed;
        mini.health = 1;
        mini.maxHealth = 1;
        mini.size = 0.58;
        this.enemies.push(mini);
        this.particles.spawn(spot.col + 0.5, spot.row + 0.5, 8, {
          color: enemy.def.color,
          speed: 0.8,
          size: 0.035,
          life: 0.5
        });
      }
      this.emitToast("Деляга распался", "#76ffcf", "Уничтожьте мини-слизней");
    }

    this.#emitHud(true);
  }
}
