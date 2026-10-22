import { ENEMIES } from "./catalog.js";
import { clamp, dist } from "../core/utils.js";

const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

const opposite = (a, b) => a && b && a.x === -b.x && a.y === -b.y;

export class Enemy {
  constructor({ type, col, row, seed, variant = 0, parent = null }, level, game) {
    const def = ENEMIES[type] || ENEMIES.crawler;
    this.type = type;
    this.def = def;
    this.seed = seed ?? Math.floor(Math.random() * 2 ** 31);
    this.variant = variant;
    this.col = col;
    this.row = row;
    this.x = col + 0.5;
    this.y = row + 0.5;
    this.radius = type === "mini" ? 0.24 : type === "golem" ? 0.36 : 0.3;
    this.maxHealth = parent ? 1 : def.health;
    this.health = this.maxHealth;
    this.speed = def.speed * level.difficulty;
    this.dir = { x: 0, y: 1 };
    this.target = null;
    this.alive = true;
    this.dying = 0;
    this.hitFlash = 0;
    this.invulnerable = false;
    this.anim = Math.random() * 10;
    this.thinkTimer = 0;
    this.turnTimer = 0;
    this.contactCooldown = 0;
    this.damageTimer = 0;
    this.spawnGrace = 0.35;
    this.parent = parent;
    this.isMini = type === "mini";
    this.bounty = parent ? 45 : def.bounty;
    this.size = type === "golem" ? 1.04 : type === "mini" ? 0.58 : 0.88;
    this.z = 0;
    this.phase = Math.random() * 6.28;
    this.visible = true;
    this.opacity = 1;
    this.leap = null;
    this.attackState = "idle";
    this.strikeCooldown = 0.7;
    this.strikeTimer = 0;
    this.strafeTimer = 0;
    this.ambushTimer = 0;
    this.lastTile = { col, row };
    this.surfaced = true;
    this.underTimer = 0;
    this.surfaceTimer = 0;
    this.trailTimer = 0;
    this.fireCooldown = 0.9 + Math.random() * 1.1;
    this.turretCharge = 0;
    this.revealedTimer = 0;
    this.deathReason = "";
    this._next = null;
    this._nextTimer = 0;
    this._lastOpen = { col, row };
  }

  get tileCol() {
    return Math.floor(this.x);
  }

  get tileRow() {
    return Math.floor(this.y);
  }

  get dangerous() {
    if (!this.alive) return false;
    if (this.type === "burrower" && !this.surfaced) return false;
    return true;
  }

  get displayName() {
    return this.isMini ? "Мини-слизень" : this.def.name;
  }

  update(dt, game) {
    if (!this.alive && this.dying <= 0) return;
    this.anim += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5.4);
    this.contactCooldown = Math.max(0, this.contactCooldown - dt);
    this.spawnGrace = Math.max(0, this.spawnGrace - dt);
    this.strikeCooldown = Math.max(0, this.strikeCooldown - dt);
    this.revealedTimer = Math.max(0, this.revealedTimer - dt);

    if (!this.alive) {
      this.dying -= dt;
      this.z = Math.min(0.5, this.z + dt * 0.5);
      return;
    }

    if (this.type === "phantom") this.#updateInvisibility(dt, game);
    if (this.type === "burrower") this.#updateBurrow(dt, game);
    if (this.type === "trickster") this.#updateTricksterState(dt, game);
    if (this.type === "turret") this.#updateTurret(dt, game);

    if (this.type === "hopper") {
      this.#updateHopper(dt, game);
    } else if (this.type === "turret") {
      this.#faceTarget(game);
    } else if (this.type === "burrower" && !this.surfaced) {
      this.#moveTowardTarget(game, dt, true);
    } else {
      this.#updateWalker(dt, game);
    }

    if (this.type === "firetail") this.#leaveFire(dt, game);

    if (this.dangerous && this.spawnGrace <= 0) this.#checkTouchPlayer(game);

    if (this.x < 1 || this.y < 1 || this.x > game.level.cols - 1 || this.y > game.level.rows - 1) {
      this.x = clamp(this.x, 1.1, game.level.cols - 1.1);
      this.y = clamp(this.y, 1.1, game.level.rows - 1.1);
    }
  }

  #updateInvisibility(dt, game) {
    this.phase += dt;
    if (this.revealedTimer > 0) {
      this.visible = true;
      this.opacity = 1;
      if (Math.random() < dt * 5) {
        game.spawnParticles(this.x, this.y - 0.1, 1, {
          color: game.level.palette.accent2,
          speed: 0.25,
          size: 0.02,
          life: 0.35,
          additive: true
        });
      }
      return;
    }
    const cycle = 6.0;
    const t = this.phase % cycle;
    if (t < 3) {
      this.visible = true;
      this.opacity = Math.min(1, t / 0.35, (3 - t) / 0.35);
    } else {
      this.visible = false;
      this.opacity = 0.08 + Math.sin((t - 3) * 9) * 0.025;
    }
    if (this.visible && Math.random() < dt * 1.6) {
      game.spawnParticles(this.x, this.y - 0.2, 1, {
        color: "rgba(220,205,255,.45)",
        speed: 0.2,
        size: 0.02,
        life: 0.7,
        additive: true
      });
    }
  }

  #updateBurrow(dt, game) {
    this.underTimer -= dt;
    this.surfaceTimer -= dt;
    if (this.surfaced) {
      if (this.surfaceTimer <= 0) {
        this.surfaced = false;
        this.underTimer = 3.2;
        this.invulnerable = true;
        game.spawnParticles(this.x, this.y, 10, {
          color: game.level.palette.softSide,
          speed: 0.7,
          size: 0.035,
          life: 0.6,
          gravity: 0.8
        });
        game.audio.play("burrow", { volume: 0.5 });
      }
    } else {
      if (this.underTimer <= 0) {
        // Pop up at the nearest open cell so we never sit inside a monolith.
        if (game.isSolid(this.tileCol, this.tileRow, { ignoreSoft: false, ignoreWalls: false })) {
          const open = this._lastOpen;
          this.col = open.col;
          this.row = open.row;
          this.x = open.col + 0.5;
          this.y = open.row + 0.5;
          this.target = null;
        }
        this.surfaced = true;
        this.invulnerable = false;
        this.surfaceTimer = 1.6;
        this.underTimer = 0;
        game.spawnParticles(this.x, this.y, 14, {
          color: game.level.palette.softTop,
          speed: 0.9,
          size: 0.04,
          life: 0.55,
          gravity: 1.2
        });
      }
    }
    if (!this.surfaced) {
      if (game.time % 0.2 < dt) {
        game.spawnParticles(this.x, this.y, 1, {
          color: game.level.palette.softSide,
          speed: 0.2,
          size: 0.026,
          life: 0.5,
          gravity: 0.6
        });
      }
    }
  }

  #updateTricksterState(dt, game) {
    const target = game.getNearestPlayer(this.x, this.y);
    if (!target) return;
    const d = dist(this.x, this.y, target.x, target.y);
    this.strikeTimer = Math.max(0, this.strikeTimer - dt);
    this.strafeTimer = Math.max(0, this.strafeTimer - dt);
    this.ambushTimer = Math.max(0, this.ambushTimer - dt);

    if (this.strikeTimer > 0) {
      this.attackState = "strike";
      this.speed = this.def.speed * game.level.difficulty * 2.15;
      return;
    }
    if (this.attackState === "strike") {
      this.attackState = "stalk";
      this.speed = this.def.speed * game.level.difficulty;
      this.strikeCooldown = 2.5;
    }
    if (d < 3.2 && this.strikeCooldown <= 0) {
      this.attackState = "wait";
      this.ambushTimer = 0.45 + Math.random() * 0.5;
      if (this.ambushTimer <= 0.2) this.attackState = "stalk";
      return;
    }
    if (d < 5.2 && d > 2.3) {
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 0.6 + Math.random() * 0.5;
        this.attackState = Math.random() < 0.5 ? "feint" : "stalk";
      }
      if (this.attackState === "feint" && this.strikeCooldown <= 0 && Math.random() < dt * 1.6) {
        this.strikeTimer = 0.85;
        game.audio.play("trickster", { volume: 0.35 });
      }
    } else {
      this.attackState = "stalk";
    }
  }

  #updateTurret(dt, game) {
    this.fireCooldown -= dt;
    this.turretCharge = clamp(1 - this.fireCooldown / 0.55, 0, 1);
    if (this.fireCooldown <= 0) {
      this.fireCooldown = 2.35 + Math.random() * 0.65;
      this.turretCharge = 0;
      game.spawnTurretBurst(this);
    }
  }

  #updateHopper(dt, game) {
    if (this.leap) {
      this.leap.time += dt;
      const t = clamp(this.leap.time / this.leap.duration, 0, 1);
      this.x = this.leap.fromX + (this.leap.toX - this.leap.fromX) * t;
      this.y = this.leap.fromY + (this.leap.toY - this.leap.fromY) * t;
      this.z = Math.sin(t * Math.PI) * 0.48;
      if (t >= 1) {
        this.x = this.leap.toX;
        this.y = this.leap.toY;
        this.z = 0;
        const landingDx = this.x - (this.leapFrom?.x ?? this.x);
        const landingDy = this.y - (this.leapFrom?.y ?? this.y);
        this.dir = Math.abs(landingDx) > Math.abs(landingDy)
          ? { x: Math.sign(landingDx), y: 0 }
          : { x: 0, y: Math.sign(landingDy) };
        this.leap = null;
        this.thinkTimer = 0.3 + Math.random() * 0.5;
        game.spawnParticles(this.x, this.y + 0.2, 6, {
          color: game.level.palette.floorGlow,
          speed: 0.5,
          size: 0.035,
          life: 0.38,
          gravity: 0.6
        });
      }
      return;
    }

    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    const target = game.getNearestPlayer(this.x, this.y);
    let candidates = [];
    for (const dir of DIRS) {
      for (let distance = 1; distance <= 2; distance += 1) {
        const col = this.tileCol + dir.x * distance;
        const row = this.tileRow + dir.y * distance;
        if (!game.isInside(col, row)) continue;
        if (!game.isLandingCell(col, row)) continue;
        const weight = target ? Math.max(1, 7 - dist(col, row, target.x, target.y)) : 4;
        candidates.push({ col, row, weight });
      }
    }
    if (!candidates.length) return;
    const total = candidates.reduce((sum, c) => sum + c.weight, 0);
    let roll = Math.random() * total;
    let picked = candidates[0];
    for (const c of candidates) {
      roll -= c.weight;
      if (roll <= 0) {
        picked = c;
        break;
      }
    }
    this.leapFrom = { x: this.x, y: this.y };
    this.leap = {
      fromX: this.x,
      fromY: this.y,
      toX: picked.col + 0.5,
      toY: picked.row + 0.5,
      time: 0,
      duration: 0.44 + Math.random() * 0.18
    };
    this.col = picked.col;
    this.row = picked.row;
    game.spawnParticles(this.x, this.y + 0.2, 5, {
      color: game.level.palette.accent,
      speed: 0.45,
      size: 0.03,
      life: 0.35,
      gravity: 0.5
    });
  }

  #updateWalker(dt, game) {
    this.thinkTimer -= dt;
    if (!this.target || this.thinkTimer <= 0 || !this.alive) {
      this.#chooseTarget(game);
      this.thinkTimer = this.type === "crawler" ? 0.8 : this.type === "runner" ? 0.34 : 0.26;
    }
    this.#moveTowardTarget(game, dt);
  }

  #chooseTarget(game) {
    const here = { col: this.tileCol, row: this.tileRow };
    if (!game.isInside(here.col, here.row)) return;
    const player = game.getNearestPlayer(this.x, this.y);
    const mode = this.def.role;

    if (this.type === "burrower" && !this.surfaced) {
      if (player) {
        const next = game.pathNext(here.col, here.row, Math.floor(player.x), Math.floor(player.y), { ignoreAll: true, avoidBombs: false, maxSteps: 40 });
        if (next) {
          this.#setTarget(next);
          return;
        }
      }
      this.#randomTarget(game, here);
      return;
    }

    if (this.attackState === "wait" && this.type === "trickster") {
      // A short pause is a feint: then it snaps toward the player.
      this.attackState = "stalk";
      this.strikeTimer = 0.7;
      this.speed = this.def.speed * game.level.difficulty * 1.9;
      if (player) {
        const next = game.pathNext(here.col, here.row, Math.floor(player.x), Math.floor(player.y), { avoidBombs: true });
        if (next) {
          this.#setTarget(next);
          return;
        }
      }
    }

    if ((this.type === "burrower" && this.surfaced && player) || mode === "chase" || mode === "trickster" || (mode === "invisible" && player && dist(this.x, this.y, player.x, player.y) < 5)) {
      if (player) {
        const next = game.pathNext(here.col, here.row, Math.floor(player.x), Math.floor(player.y), { avoidBombs: true });
        if (next) {
          this.#setTarget(next);
          return;
        }
      }
    }

    if (mode === "flee") {
      const threats = game.players.filter((p) => p.alive);
      let best = null;
      let bestScore = -Infinity;
      for (const dir of DIRS) {
        const col = here.col + dir.x;
        const row = here.row + dir.y;
        if (!game.isEnemyWalkable(col, row, { avoidBombs: true })) continue;
        let score = 0;
        for (const p of threats) score += dist(col, row, p.x, p.y);
        score += Math.random() * 2.4;
        if (score > bestScore) {
          bestScore = score;
          best = { col, row };
        }
      }
      if (best) {
        this.#setTarget(best);
        return;
      }
    }

    if (mode === "trail") {
      // Roam more deliberately so the fire trail forms readable patterns.
      if (player && Math.random() < 0.42) {
        const next = game.pathNext(here.col, here.row, Math.floor(player.x), Math.floor(player.y), { avoidBombs: true, maxSteps: 20 });
        if (next) {
          this.#setTarget(next);
          return;
        }
      }
    }

    if (this.type === "runner") {
      // Runners prefer to keep their momentum.
      if (this.dir && game.isEnemyWalkable(here.col + this.dir.x, here.row + this.dir.y, { avoidBombs: true }) && Math.random() < 0.58) {
        this.#setTarget({ col: here.col + this.dir.x, row: here.row + this.dir.y });
        return;
      }
    }

    this.#randomTarget(game, here);
  }

  #randomTarget(game, here) {
    const candidates = DIRS.map((dir) => ({
      col: here.col + dir.x,
      row: here.row + dir.y,
      dir
    })).filter((candidate) => {
      if (!game.isEnemyWalkable(candidate.col, candidate.row, { avoidBombs: true })) return false;
      if (opposite(candidate.dir, this.dir) && Math.random() < 0.7) return false;
      return true;
    });
    if (!candidates.length) {
      // Unstick: allow reversing, then any walkable tile.
      for (const dir of DIRS) {
        const col = here.col + dir.x;
        const row = here.row + dir.y;
        if (game.isEnemyWalkable(col, row, { avoidBombs: false })) {
          this.#setTarget({ col, row });
          return;
        }
      }
      this.target = null;
      return;
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    this.#setTarget(pick);
  }

  #setTarget(cell) {
    if (!cell) return;
    this.target = { col: cell.col, row: cell.row };
    this.dir = {
      x: Math.sign(cell.col - this.tileCol),
      y: Math.sign(cell.row - this.tileRow)
    };
    this.col = cell.col;
    this.row = cell.row;
  }

  #moveTowardTarget(game, dt, ignoreWalls = false) {
    if (!this.target) return;
    const tx = this.target.col + 0.5;
    const ty = this.target.row + 0.5;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const distance = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (distance <= step || distance < 0.01) {
      this.x = tx;
      this.y = ty;
      if (!ignoreWalls && this.type !== "burrower") {
        this._lastOpen = { col: this.target.col, row: this.target.row };
      }
      if (this.type === "firetail") this.trailTimer += 0.1;
      this.target = null;
      // Choose again on the next update.
    } else {
      this.x += (dx / distance) * step;
      this.y += (dy / distance) * step;
      this.dir = { x: Math.sign(dx), y: Math.sign(dy) };
    }
    if (this.type === "firetail" && this.target === null && this.thinkTimer > 0.05) {
      this.thinkTimer = Math.min(this.thinkTimer, 0.04);
    }
  }

  #leaveFire(dt, game) {
    this.trailTimer -= dt;
    if (this.trailTimer > 0) return;
    this.trailTimer = 0.32;
    const col = this.tileCol;
    const row = this.tileRow;
    if (!game.isInside(col, row)) return;
    if (this.lastTile.col === col && this.lastTile.row === row) return;
    this.lastTile = { col, row };
    game.addFireTrail(col, row, this);
  }

  #faceTarget(game) {
    const player = game.getNearestPlayer(this.x, this.y);
    if (!player) return;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = { x: Math.sign(dx), y: 0 };
    else this.dir = { x: 0, y: Math.sign(dy) };
  }

  #checkTouchPlayer(game) {
    for (const player of game.players) {
      if (!player.alive || player.invulnerable > 0) continue;
      const distance = dist(this.x, this.y, player.x, player.y);
      const threshold = this.radius + player.radius + 0.08;
      if (distance < threshold) {
        if (this.contactCooldown > 0) continue;
        this.contactCooldown = 0.8;
        const armored = player.armor > 0;
        game.hurtPlayer(player, {
          source: "enemy",
          enemy: this,
          damage: 1,
          ignoreArmor: false,
          knockback: { x: player.x - this.x, y: player.y - this.y }
        });
        if (armored) {
          game.spawnParticles(player.x, player.y, 12, {
            color: "#d9efff",
            speed: 1.1,
            size: 0.035,
            life: 0.6,
            additive: true
          });
        }
        game.spawnParticles(this.x, this.y, 5, {
          color: this.def.color,
          speed: 0.7,
          size: 0.035,
          life: 0.35,
          gravity: 0.3
        });
        game.shake(0.14);
        game.audio.play("touch", { volume: 0.55 });
      }
    }
  }

  takeDamage(amount, game, source) {
    if (!this.alive) return false;
    if (this.type === "burrower" && !this.surfaced) {
      game.floatText(this.x, this.y - 0.4, "ПОД ЗЕМЛЁЙ", game.level.palette.muted || "#9aa7b8", 0.55);
      return false;
    }
    if (this.spawnGrace > 0) return false;
    this.health -= amount;
    this.hitFlash = 1;
    this.damageTimer = 0.35;
    if (this.health <= 0) {
      this.die(game, source);
    } else {
      game.audio.play("armorHit", { volume: 0.6 });
      game.spawnParticles(this.x, this.y, 5, {
        color: this.def.color,
        speed: 0.85,
        size: 0.035,
        life: 0.4
      });
    }
    return true;
  }

  die(game, source = "bomb") {
    if (!this.alive) return;
    this.alive = false;
    this.dying = 0.5;
    this.deathReason = source;
    game.onEnemyKilled(this);
  }

  serialize() {
    return {
      type: this.type,
      x: this.x,
      y: this.y,
      health: this.health,
      maxHealth: this.maxHealth,
      opacity: this.opacity,
      surfaced: this.surfaced,
      attackState: this.attackState,
      variant: this.variant,
      seed: this.seed
    };
  }
}
