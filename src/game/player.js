import { POWERUPS, MOUNTS } from "./catalog.js";
import { clamp, dist } from "../core/utils.js";

export class Player {
  constructor(index, spawn, level, mode = "campaign") {
    this.index = index;
    this.name = index === 0 ? "Игрок 1" : "Игрок 2";
    this.spawn = { col: spawn.col, row: spawn.row };
    this.col = spawn.col;
    this.row = spawn.row;
    this.x = spawn.col + 0.5;
    this.y = spawn.row + 0.5;
    this.moveTarget = null;
    this.radius = 0.285;
    this.dir = { x: index === 0 ? 1 : -1, y: 0 };
    this.moving = false;
    this.animTime = Math.random() * 10;
    this.walkPhase = 0;
    this.baseSpeed = 3.42;
    this.speedLevels = 0;
    this.baseRange = 1;
    this.baseBombs = 1;
    this.maxHearts = mode === "versus" ? 1 : 3;
    this.hearts = this.maxHearts;
    this.armor = 0;
    this.mount = null;
    this.mountActionCooldown = 0;
    this.invulnerable = 2.1;
    this.hurtFlash = 0;
    this.bombCooldown = 0;
    this.kickCooldown = 0;
    this.alive = true;
    this.powers = new Set();
    this.powerLevels = {};
    this.score = 0;
    this.bombsPlaced = 0;
    this.blocksDestroyed = 0;
    this.kills = 0;
    this.pickupsCollected = 0;
    this.opacity = 1;
    this.deadTimer = 0;
    this.mode = mode;
    this.spawnFlash = 1;
  }

  get range() {
    return this.baseRange + (this.mount?.key === "gloom" ? 1 : 0);
  }

  get maxBombs() {
    return this.baseBombs;
  }

  get speedFactor() {
    const mountBoost = this.mount?.key === "roo" ? 1.22 : this.mount ? 1.04 : 1;
    return (1 + this.speedLevels * 0.18) * mountBoost;
  }

  get speed() {
    return this.baseSpeed * this.speedFactor;
  }

  get canPlaceBomb() {
    return this.alive && this.bombCooldown <= 0 && typeof this._game?.bombAt === "function" && this._game.bombs.filter((bomb) => bomb.owner === this.index).length < this.maxBombs && !this._game.bombAt(Math.floor(this.x), Math.floor(this.y));
  }

  setGame(game) {
    this._game = game;
  }

  /**
   * Persistent campaign loadout: everything the player earned that should
   * survive into the next level. Current hearts are intentionally not carried;
   * max hearts (Phoenix) and armor charges are.
   */
  getLoadout() {
    return {
      baseRange: this.baseRange,
      baseBombs: this.baseBombs,
      speedLevels: this.speedLevels,
      maxHearts: this.maxHearts,
      armor: this.armor,
      powers: [...this.powers],
      powerLevels: { ...this.powerLevels },
      mountKey: this.mount?.key || null
    };
  }

  applyLoadout(loadout) {
    if (!loadout || typeof loadout !== "object") return;
    this.baseRange = clamp(Math.floor(Number(loadout.baseRange) || 1), 1, 9);
    this.baseBombs = clamp(Math.floor(Number(loadout.baseBombs) || 1), 1, 7);
    this.speedLevels = clamp(Math.floor(Number(loadout.speedLevels) || 0), 0, 4);
    this.maxHearts = clamp(Math.floor(Number(loadout.maxHearts) || 3), 1, 6);
    this.hearts = this.maxHearts;
    this.armor = clamp(Math.floor(Number(loadout.armor) || 0), 0, 3);
    this.powers = new Set((Array.isArray(loadout.powers) ? loadout.powers : []).filter((key) => POWERUPS[key]));
    this.powerLevels = {};
    if (loadout.powerLevels && typeof loadout.powerLevels === "object") {
      for (const [key, value] of Object.entries(loadout.powerLevels)) {
        const amount = Number(value);
        if (amount > 0) this.powerLevels[key] = clamp(Math.floor(amount), 0, 10);
      }
    }
    if (loadout.mountKey && MOUNTS[loadout.mountKey]) {
      const def = MOUNTS[loadout.mountKey];
      this.mount = { key: loadout.mountKey, name: def.name, shield: 1, bob: Math.random() * 6 };
    }
  }

  /** Snap the player to the exact centre of a grid cell. */
  setTile(col, row) {
    this.col = col;
    this.row = row;
    this.x = col + 0.5;
    this.y = row + 0.5;
    this.moveTarget = null;
    this.moving = false;
    this.walkPhase = 0;
  }

  addPowerup(type) {
    const def = POWERUPS[type];
    if (!def) return false;
    if (["range", "bomb", "speed", "armor", "phoenix"].includes(type)) {
      this.powerLevels[type] = (this.powerLevels[type] || 0) + 1;
    }
    switch (type) {
      case "range":
        this.baseRange = clamp(this.baseRange + 1, 1, 9);
        break;
      case "bomb":
        this.baseBombs = clamp(this.baseBombs + 1, 1, 7);
        break;
      case "speed":
        this.speedLevels = clamp(this.speedLevels + 1, 0, 4);
        break;
      case "armor":
        this.armor = clamp(this.armor + 1, 0, 3);
        break;
      case "phoenix":
        this.maxHearts = clamp(this.maxHearts + 1, 1, 6);
        this.hearts = clamp(this.hearts + 1, 0, this.maxHearts);
        break;
      case "detonator":
      case "wallpass":
      case "throw":
      case "proximity":
      case "kick":
      case "immunity":
      case "magnet":
        this.powers.add(type);
        break;
      default:
        break;
    }
    return true;
  }

  hasPower(type) {
    return this.powers.has(type);
  }

  mountCreature(key, game) {
    const def = MOUNTS[key];
    if (!def) return false;
    this.mount = { key, name: def.name, shield: 1, bob: Math.random() * 6 };
    this.mountActionCooldown = 0.6;
    game.floatText(this.x, this.y - 0.5, def.name.toUpperCase(), def.color, 1.2, 0.17);
    game.audio.play("mount", { volume: 0.9 });
    game.spawnParticles(this.x, this.y, 18, {
      color: def.color,
      color2: "#fff7df",
      speed: 1.5,
      size: 0.04,
      life: 0.8,
      additive: true,
      shape: "spark"
    });
    return true;
  }

  removeMount(game) {
    if (!this.mount) return;
    const def = MOUNTS[this.mount.key];
    game?.spawnParticles(this.x, this.y, 12, {
      color: def?.color || "#ffffff",
      speed: 1.1,
      size: 0.035,
      life: 0.6,
      gravity: 0.4
    });
    this.mount = null;
  }

  heal(amount = 1) {
    this.hearts = clamp(this.hearts + amount, 0, this.maxHearts);
  }

  update(dt, game) {
    if (!this.alive || game.state !== "playing") return;
    this.animTime += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
    this.bombCooldown = Math.max(0, this.bombCooldown - dt);
    this.kickCooldown = Math.max(0, this.kickCooldown - dt);
    this.mountActionCooldown = Math.max(0, this.mountActionCooldown - dt);
    this.spawnFlash = Math.max(0, this.spawnFlash - dt);
    this.opacity = this.invulnerable > 0 ? 0.86 + Math.sin(this.animTime * 22) * 0.14 : 1;

    const move = game.input.getMoveVector(this.index);

    // Strict cell movement: the player either stands exactly in the centre of
    // a cell or smoothly travels toward the centre of an adjacent cell.
    if (this.moving && this.moveTarget) {
      this.#advanceStep(dt);
      if (!this.moving) {
        const next = game.input.getMoveVector(this.index);
        if (next.x !== 0 || next.y !== 0) this.#beginStep(next, game);
      }
    } else {
      this.moving = false;
      this.x = this.col + 0.5;
      this.y = this.row + 0.5;
      if (move.x !== 0 || move.y !== 0) this.#beginStep(move, game);
    }

    if (this.moving) this.walkPhase += dt * this.speed * 2.8;
    else this.walkPhase = 0;

    this.#collectNearby(game);
    this.#checkPortal(game);
  }

  #beginStep(dir, game) {
    if (!dir || (!dir.x && !dir.y)) return false;
    this.dir = { x: Math.sign(dir.x), y: Math.sign(dir.y) };
    const nextCol = this.col + this.dir.x;
    const nextRow = this.row + this.dir.y;
    if (!game.canPlayerEnterCell(this, nextCol, nextRow)) {
      if (this.hasPower("kick") && this.kickCooldown <= 0) {
        const bomb = game.bombs.find(
          (candidate) =>
            !candidate.exploded &&
            !candidate.flight &&
            candidate.col === nextCol &&
            candidate.row === nextRow
        );
        if (bomb && game.kickBomb(bomb, this.dir, this)) this.kickCooldown = 0.28;
      }
      this.x = this.col + 0.5;
      this.y = this.row + 0.5;
      return false;
    }
    this.moveTarget = {
      col: nextCol,
      row: nextRow,
      x: nextCol + 0.5,
      y: nextRow + 0.5
    };
    this.moving = true;
    return true;
  }

  #advanceStep(dt) {
    if (!this.moveTarget) {
      this.moving = false;
      return;
    }
    const dx = this.moveTarget.x - this.x;
    const dy = this.moveTarget.y - this.y;
    const remaining = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (remaining <= step || remaining < 0.0001) {
      this.x = this.moveTarget.x;
      this.y = this.moveTarget.y;
      this.col = this.moveTarget.col;
      this.row = this.moveTarget.row;
      this.moveTarget = null;
      this.moving = false;
      return;
    }
    this.x += (dx / remaining) * step;
    this.y += (dy / remaining) * step;
  }

  #collectNearby(game) {
    for (let i = game.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = game.pickups[i];
      if (!pickup.revealed) continue;
      if (dist(this.x, this.y, pickup.x, pickup.y) < 0.55) {
        game.collectPickup(this, pickup, i);
      }
    }
    const egg = game.level.mountEgg;
    if (egg && !game.mountEggUsed && !this.mount && dist(this.x, this.y, egg.col + 0.5, egg.row + 0.5) < 0.62) {
      game.hatchEgg(this, egg);
    }
    // Small emergency heart / score sparkles are handled by game.
  }

  #checkPortal(game) {
    if (!game.portalActive || !game.level.exit) return;
    if (dist(this.x, this.y, game.level.exit.col + 0.5, game.level.exit.row + 0.5) < 0.5) {
      game.enterPortal(this);
    }
  }

  getCooldownRatio(type) {
    if (type === "action" && this.mount) {
      return 1 - clamp(this.mountActionCooldown / 2.8, 0, 1);
    }
    return 1;
  }

  serialize() {
    return {
      index: this.index,
      x: this.x,
      y: this.y,
      hearts: this.hearts,
      armor: this.armor,
      mount: this.mount?.key || null,
      powers: [...this.powers],
      range: this.range,
      bombs: this.maxBombs
    };
  }
}
