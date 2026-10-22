import {
  TAU,
  clamp,
  lighten,
  darken,
  withAlpha,
  roundedRect,
  ellipse,
  fillCircle,
  starPath
} from "../core/utils.js";
import { RNG, hashString, hash2d } from "../core/rng.js";
import { AmbientSystem } from "./particles.js";
import {
  drawHero,
  drawEnemy,
  drawBomb,
  drawPickup,
  drawEgg,
  drawPortal,
  drawFlameCell,
  drawTrailFire,
  drawProjectile,
  drawEffectRing
} from "./art.js";
import { TILE } from "./catalog.js";

function outline(ctx, color = "rgba(3, 9, 15, .55)", width = 0.016) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

const FLOOR_PATTERNS = {
  ruins: ["moss", "stone", "leaf"],
  magma: ["crack", "basalt", "ember"],
  glacier: ["facet", "frost", "snow"],
  circuit: ["trace", "grid", "node"],
  candy: ["stripe", "dot", "gloss"],
  void: ["star", "rune", "void"],
  abyss: ["ripple", "shell", "bubble"],
  sand: ["dune", "glyph", "grain"],
  swamp: ["puddle", "moss", "bubble"],
  marble: ["vein", "tile", "gold"]
};

export class ArenaRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.dpr = 1;
    this.baseMaxDpr = window.matchMedia?.("(pointer: coarse)")?.matches ? 1.75 : 2;
    this.maxDpr = this.baseMaxDpr;
    this.cssW = 0;
    this.cssH = 0;
    this.tile = 48;
    this.offsetX = 0;
    this.offsetY = 0;
    this.levelSeed = null;
    this.staticCanvas = document.createElement("canvas");
    this.staticCtx = this.staticCanvas.getContext("2d", { alpha: false });
    this.ambient = new AmbientSystem("high");
    this.quality = "high";
    this.time = 0;
    this.glowTiles = [];
    this.runes = [];
    this.softCache = null;
    this.softCacheSeed = null;
    this.resizeQueued = false;
    this.lastLevel = null;
    this._shakeSeed = 1;
    this._frame = 0;
    this._resizeObserver = null;
    this.onResize = null;
  }

  attachResizeObserver(element) {
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (!element || typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver(() => {
      if (this.resizeQueued) return;
      this.resizeQueued = true;
      requestAnimationFrame(() => {
        this.resizeQueued = false;
        this.resize();
        this.onResize?.();
      });
    });
    this._resizeObserver.observe(element);
  }

  setQuality(quality) {
    this.quality = quality;
    this.ambient.setQuality(quality);
    const nextMaxDpr = quality === "low" ? Math.min(1.25, this.baseMaxDpr) : quality === "medium" ? Math.min(1.5, this.baseMaxDpr) : this.baseMaxDpr;
    if (nextMaxDpr !== this.maxDpr) {
      this.maxDpr = nextMaxDpr;
      if (this.cssW > 0) this.resize();
    }
    this.invalidate();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const dpr = clamp(window.devicePixelRatio || 1, 1, this.maxDpr);
    this.dpr = dpr;
    this.cssW = rect.width;
    this.cssH = rect.height;
    const bw = Math.round(rect.width * dpr);
    const bh = Math.round(rect.height * dpr);
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    this.ctx.imageSmoothingEnabled = true;
    if (this.lastLevel) {
      this.#computeLayout(this.lastLevel);
      this.#buildStatic(this.lastLevel);
    }
    return true;
  }

  invalidate() {
    this.levelSeed = null;
  }

  #computeLayout(level) {
    const pad = 0;
    const availableW = this.cssW - pad * 2;
    const availableH = this.cssH - pad * 2;
    const tile = Math.min(availableW / level.cols, availableH / level.rows);
    this.tile = tile;
    this.offsetX = (this.cssW - tile * level.cols) / 2;
    this.offsetY = (this.cssH - tile * level.rows) / 2;
  }

  syncLevel(game) {
    const level = game.level;
    if (!level) return;
    this.lastLevel = level;
    if (this.levelSeed !== level.seed || this.cssW < 2) {
      this.levelSeed = level.seed;
      this.#computeLayout(level);
      this.#buildStatic(level);
      this.ambient.setQuality(this.quality);
      this.ambient.init(level.palette.particle, level.palette, level.cols, level.rows);
      this._shakeSeed = hashString(`${level.seed}:shake`);
      this._frame = 0;
    }
  }

  #buildStatic(level) {
    if (this.cssW < 2 || this.cssH < 2) return;
    const dpr = this.dpr;
    const canvas = this.staticCanvas;
    canvas.width = Math.round(this.cssW * dpr);
    canvas.height = Math.round(this.cssH * dpr);
    const ctx = this.staticCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const palette = level.palette;
    this.glowTiles = [];
    this.runes = [];

    // Deep background with a soft halo behind the arena.
    const bg = ctx.createLinearGradient(0, 0, this.cssW, this.cssH);
    bg.addColorStop(0, palette.bgTop);
    bg.addColorStop(0.52, palette.bgMid);
    bg.addColorStop(1, palette.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    const halo = ctx.createRadialGradient(
      this.cssW * 0.5,
      this.cssH * 0.42,
      this.cssW * 0.08,
      this.cssW * 0.5,
      this.cssH * 0.5,
      this.cssW * 0.72
    );
    halo.addColorStop(0, withAlpha(palette.hazeA, 0.12));
    halo.addColorStop(0.55, withAlpha(palette.hazeB, 0.025));
    halo.addColorStop(1, withAlpha(palette.hazeB, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // Faint structural guide lines around the arena.
    ctx.save();
    ctx.strokeStyle = withAlpha(palette.accent, 0.045);
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * TAU;
      const x1 = this.cssW / 2 + Math.cos(angle) * this.cssW * 0.54;
      const y1 = this.cssH / 2 + Math.sin(angle) * this.cssH * 0.54;
      ctx.beginPath();
      ctx.moveTo(this.cssW / 2, this.cssH / 2);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.tile, this.tile);

    const { cols, rows, tiles } = level;

    // Draw floor first.
    for (let row = 1; row < rows - 1; row += 1) {
      for (let col = 1; col < cols - 1; col += 1) {
        const index = row * cols + col;
        const tile = tiles[index];
        if (tile === TILE.WALL) continue;
        this.#drawFloorTile(ctx, col, row, level, level.tileSeeds[index]);
      }
    }

    // Soft blocks are dynamic, but their underlying tile should have a shadow
    // only when the block is present. Renderer draws shadows on top.

    // Monolithic walls.
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (tiles[row * cols + col] !== TILE.WALL) continue;
        this.#drawHardWall(ctx, col, row, level, level.tileSeeds[row * cols + col], { border: row === 0 || col === 0 || row === rows - 1 || col === cols - 1 });
      }
    }

    // Arena inner border glow.
    ctx.strokeStyle = withAlpha(palette.accent, 0.17);
    ctx.lineWidth = 0.028;
    ctx.strokeRect(0.02, 0.02, cols - 0.04, rows - 0.04);
    ctx.restore();

    this.#buildSoftCache(level);
  }

  #buildSoftCache(level) {
    if (this.softCacheSeed === level.seed && this.softCache?.length) return;
    this.softCacheSeed = level.seed;
    const variants = 6;
    const size = 160;
    this.softCache = [];
    for (let index = 0; index < variants; index += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { alpha: true });
      ctx.setTransform(size, 0, 0, size, 0, 0);
      this.#drawSoftBlock(ctx, 0, 0, level, 0, {
        at: { x: 0, y: 0 },
        seedOverride: hash2d(index + 3, index * 7 + 1, level.decorSeed + 91)
      });
      this.softCache.push(canvas);
    }
  }

  #drawFloorTile(ctx, col, row, level, seed) {
    const p = level.palette;
    const style = p.style;
    const alt = hash2d(col, row, level.decorSeed) > 0.52;
    const base = alt ? p.floorA : p.floorB;
    const detail = hash2d(col + 91, row + 13, level.decorSeed);
    const shade = hash2d(col + 200, row + 300, level.decorSeed);
    const x = col;
    const y = row;

    ctx.fillStyle = base;
    ctx.fillRect(x, y, 1.02, 1.02);

    // Subtle tile bevel.
    ctx.fillStyle = withAlpha(alt ? p.floorC : p.floorA, 0.32);
    ctx.fillRect(x, y + 0.94, 1, 0.06);
    ctx.fillRect(x + 0.94, y, 0.06, 1);
    ctx.fillStyle = withAlpha(p.floorB, 0.23);
    ctx.fillRect(x, y, 1, 0.035);
    ctx.fillRect(x, y, 0.035, 1);

    // Grout lines.
    ctx.strokeStyle = withAlpha(p.floorLine, 0.54);
    ctx.lineWidth = 0.016;
    ctx.strokeRect(x + 0.008, y + 0.008, 0.984, 0.984);

    const pattern = FLOOR_PATTERNS[style] || FLOOR_PATTERNS.ruins;
    const mode = pattern[Math.floor(detail * pattern.length)];

    if (style === "ruins") {
      if (detail > 0.58) {
        ctx.strokeStyle = withAlpha(p.floorLine, 0.75);
        ctx.lineWidth = 0.02;
        ctx.beginPath();
        ctx.moveTo(x + 0.12 + shade * 0.25, y + 0.1);
        ctx.lineTo(x + 0.3 + shade * 0.15, y + 0.34);
        ctx.lineTo(x + 0.22, y + 0.58);
        ctx.lineTo(x + 0.39, y + 0.84);
        ctx.stroke();
      }
      if (detail > 0.68) {
        // Moss cushions.
        ctx.fillStyle = withAlpha(p.accentSoft, 0.35);
        for (let i = 0; i < 3; i += 1) {
          const a = hash2d(col + i * 17, row + i * 5, level.decorSeed + 4);
          ellipse(ctx, x + 0.14 + a * 0.7, y + 0.16 + a * 0.64, 0.1 + a * 0.12, 0.045 + a * 0.04, a * 2);
          ctx.fill();
        }
        this.glowTiles.push({ x: x + 0.5, y: y + 0.5, size: 0.2, seed: detail, type: "moss" });
      }
      if (detail < 0.12) {
        // Fallen leaf.
        ctx.save();
        ctx.translate(x + 0.26 + shade * 0.5, y + 0.28 + detail * 2);
        ctx.rotate(detail * 10);
        ctx.fillStyle = withAlpha(p.accent, 0.35);
        ellipse(ctx, 0, 0, 0.065, 0.025);
        ctx.fill();
        ctx.restore();
      }
    } else if (style === "magma") {
      if (detail > 0.42) {
        const crackGrad = ctx.createLinearGradient(x, y, x + 1, y + 1);
        crackGrad.addColorStop(0, withAlpha(p.danger, 0.2));
        crackGrad.addColorStop(1, withAlpha(p.gold, 0.05));
        ctx.strokeStyle = withAlpha(p.danger, 0.45 + detail * 0.3);
        ctx.lineWidth = 0.023;
        ctx.beginPath();
        ctx.moveTo(x + 0.08, y + 0.72 - detail * 0.2);
        ctx.lineTo(x + 0.32, y + 0.56);
        ctx.lineTo(x + 0.4, y + 0.32);
        ctx.lineTo(x + 0.68, y + 0.24);
        ctx.lineTo(x + 0.9, y + 0.08);
        ctx.stroke();
        this.glowTiles.push({ x: x + 0.42, y: y + 0.38, size: 0.32, seed: detail, type: "lava" });
      }
      ctx.fillStyle = withAlpha("#15100f", 0.35);
      for (let i = 0; i < 3; i += 1) {
        const a = hash2d(col + i * 37, row + i * 11, level.decorSeed + 7);
        fillCircle(ctx, x + a, y + (a * 3) % 1, 0.018 + a * 0.025);
      }
    } else if (style === "glacier") {
      if (detail > 0.47) {
        ctx.save();
        ctx.translate(x + 0.24 + shade * 0.5, y + 0.32 + hash2d(row, col, 7) * 0.4);
        ctx.rotate(detail * 5);
        ctx.fillStyle = withAlpha(p.frost, 0.18);
        ctx.strokeStyle = withAlpha(p.accent2, 0.38);
        ctx.lineWidth = 0.015;
        ctx.beginPath();
        ctx.moveTo(-0.13, 0.04);
        ctx.lineTo(0, -0.2);
        ctx.lineTo(0.12, 0.03);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        this.glowTiles.push({ x: x + 0.5, y: y + 0.5, size: 0.25, seed: detail, type: "ice" });
      }
      ctx.strokeStyle = withAlpha("#e7ffff", 0.13);
      ctx.lineWidth = 0.012;
      ctx.beginPath();
      ctx.moveTo(x + 0.1, y + 0.8);
      ctx.lineTo(x + 0.42, y + 0.62);
      ctx.lineTo(x + 0.62, y + 0.85);
      ctx.stroke();
    } else if (style === "circuit") {
      if (detail > 0.46) {
        ctx.strokeStyle = withAlpha(p.accent, 0.26);
        ctx.lineWidth = 0.014;
        ctx.beginPath();
        const sx = x + 0.15;
        const sy = y + 0.78;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 0.28, sy);
        ctx.lineTo(sx + 0.28, y + 0.3);
        ctx.lineTo(x + 0.82, y + 0.3);
        ctx.stroke();
        ctx.fillStyle = withAlpha(p.accent, 0.4);
        fillCircle(ctx, x + 0.82, y + 0.3, 0.035);
        this.glowTiles.push({ x: x + 0.82, y: y + 0.3, size: 0.17, seed: detail, type: "node" });
      }
      ctx.strokeStyle = withAlpha(p.floorLine, 0.5);
      ctx.lineWidth = 0.01;
      ctx.strokeRect(x + 0.22, y + 0.2, 0.56, 0.56);
      ctx.fillStyle = withAlpha(p.accent2, 0.12);
      ctx.fillRect(x + 0.22, y + 0.2, 0.56, 0.56);
    } else if (style === "candy") {
      const gradient = ctx.createLinearGradient(x, y, x + 1, y + 1);
      gradient.addColorStop(0, withAlpha(p.floorB, 0.9));
      gradient.addColorStop(0.5, withAlpha(p.floorA, 0.7));
      gradient.addColorStop(1, withAlpha(p.floorC, 0.8));
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, 1, 1);
      ctx.fillStyle = withAlpha("#fff2df", 0.18);
      ctx.beginPath();
      ctx.ellipse(x + 0.35, y + 0.26, 0.16, 0.06, -0.5, 0, TAU);
      ctx.fill();
      if (detail > 0.6) {
        ctx.fillStyle = withAlpha(p.accent2, 0.55);
        for (let i = 0; i < 4; i += 1) {
          const a = hash2d(col + i * 11, row + 3, level.decorSeed + 2);
          ctx.save();
          ctx.translate(x + 0.16 + a * 0.7, y + 0.2 + ((a * 7) % 0.6));
          ctx.rotate(a * TAU);
          ctx.fillRect(-0.025, -0.006, 0.05, 0.012);
          ctx.restore();
        }
      }
    } else if (style === "void") {
      const gradient = ctx.createRadialGradient(x + 0.5, y + 0.5, 0.05, x + 0.5, y + 0.5, 0.72);
      gradient.addColorStop(0, withAlpha(p.floorB, 0.6));
      gradient.addColorStop(1, withAlpha(p.floorA, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, 1, 1);
      for (let i = 0; i < 3; i += 1) {
        const a = hash2d(col + i * 71, row + i * 13, level.decorSeed + 1);
        const b = hash2d(col + i * 3, row + i * 97, level.decorSeed + 8);
        ctx.fillStyle = withAlpha(i === 0 ? p.glow : "#d8ceff", 0.2 + a * 0.45);
        fillCircle(ctx, x + a, y + b, 0.006 + b * 0.012);
      }
      if (detail > 0.76) {
        ctx.strokeStyle = withAlpha(p.accent2, 0.2);
        ctx.lineWidth = 0.012;
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.5, 0.18, 0, TAU);
        ctx.stroke();
        this.glowTiles.push({ x: x + 0.5, y: y + 0.5, size: 0.3, seed: detail, type: "rune" });
      }
    } else if (style === "abyss") {
      ctx.strokeStyle = withAlpha(p.accent2, 0.18);
      ctx.lineWidth = 0.014;
      for (let i = 0; i < 3; i += 1) {
        const a = hash2d(col + i * 33, row + i * 7, level.decorSeed);
        ctx.beginPath();
        ctx.arc(x + 0.2 + a * 0.5, y + 0.25 + a * 0.4, 0.18 + a * 0.16, 0.2, 2.2);
        ctx.stroke();
      }
      if (detail > 0.64) {
        ctx.fillStyle = withAlpha(p.accentSoft, 0.38);
        ctx.beginPath();
        ctx.arc(x + 0.3, y + 0.7, 0.08, Math.PI, TAU);
        ctx.lineTo(x + 0.46, y + 0.7);
        ctx.fill();
        ctx.strokeStyle = withAlpha(p.frost, 0.35);
        ctx.lineWidth = 0.01;
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.arc(x + 0.3, y + 0.7, 0.06 + i * 0.045, Math.PI, TAU);
          ctx.stroke();
        }
      }
      ctx.fillStyle = withAlpha("#eaffff", 0.14);
      ctx.beginPath();
      ctx.ellipse(x + 0.25, y + 0.26, 0.18, 0.035, 0.5, 0, TAU);
      ctx.fill();
    } else if (style === "sand") {
      ctx.strokeStyle = withAlpha(p.floorLine, 0.4);
      ctx.lineWidth = 0.012;
      for (let i = 0; i < 3; i += 1) {
        const yy = y + 0.25 + i * 0.24;
        ctx.beginPath();
        ctx.moveTo(x + 0.08, yy);
        ctx.quadraticCurveTo(x + 0.38, yy - 0.08, x + 0.92, yy + 0.03);
        ctx.stroke();
      }
      if (detail > 0.68) {
        ctx.strokeStyle = withAlpha(p.accent, 0.34);
        ctx.lineWidth = 0.014;
        ctx.beginPath();
        ctx.moveTo(x + 0.32, y + 0.35);
        ctx.lineTo(x + 0.45, y + 0.25);
        ctx.lineTo(x + 0.58, y + 0.35);
        ctx.moveTo(x + 0.45, y + 0.25);
        ctx.lineTo(x + 0.45, y + 0.65);
        ctx.stroke();
      }
      ctx.fillStyle = withAlpha("#ffe8b3", 0.12);
      for (let i = 0; i < 4; i += 1) {
        const a = hash2d(col + i * 9, row + i * 31, level.decorSeed + 3);
        fillCircle(ctx, x + a, y + ((a * 5) % 1), 0.008);
      }
    } else if (style === "swamp") {
      if (detail > 0.56) {
        ctx.fillStyle = withAlpha(p.accent, 0.1);
        ctx.beginPath();
        ctx.ellipse(x + 0.4, y + 0.6, 0.29, 0.13, 0.2, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = withAlpha(p.accent, 0.22);
        ctx.lineWidth = 0.012;
        ctx.stroke();
        this.glowTiles.push({ x: x + 0.42, y: y + 0.6, size: 0.3, seed: detail, type: "toxic" });
      }
      ctx.fillStyle = withAlpha(p.accentSoft, 0.18);
      for (let i = 0; i < 3; i += 1) {
        const a = hash2d(col + i * 23, row + i * 17, level.decorSeed + 6);
        ellipse(ctx, x + 0.18 + a * 0.6, y + 0.3 + a * 0.5, 0.04, 0.02, a * 3);
        ctx.fill();
      }
    } else if (style === "marble") {
      const sheen = ctx.createLinearGradient(x, y, x + 1, y + 1);
      sheen.addColorStop(0, withAlpha("#ffffff", 0.03));
      sheen.addColorStop(0.5, withAlpha("#ffffff", 0));
      sheen.addColorStop(1, withAlpha("#ffffff", 0.025));
      ctx.fillStyle = sheen;
      ctx.fillRect(x, y, 1, 1);
      ctx.strokeStyle = withAlpha(p.gold, 0.22);
      ctx.lineWidth = 0.009;
      ctx.beginPath();
      ctx.moveTo(x + 0.06, y + 0.66);
      ctx.quadraticCurveTo(x + 0.34, y + 0.48, x + 0.5, y + 0.55);
      ctx.quadraticCurveTo(x + 0.76, y + 0.64, x + 0.92, y + 0.34);
      ctx.stroke();
      if (detail > 0.8) {
        ctx.strokeStyle = withAlpha(p.gold, 0.42);
        ctx.lineWidth = 0.013;
        ctx.strokeRect(x + 0.3, y + 0.3, 0.4, 0.4);
        ctx.strokeStyle = withAlpha(p.gold, 0.14);
        ctx.strokeRect(x + 0.36, y + 0.36, 0.28, 0.28);
      }
    }

    // Universal fine grain / scratches.
    if (seed % 7 === 0) {
      ctx.strokeStyle = withAlpha(p.floorLine, 0.3);
      ctx.lineWidth = 0.008;
      ctx.beginPath();
      const a = hash2d(col, row, level.decorSeed + 21);
      const b = hash2d(col, row, level.decorSeed + 22);
      ctx.moveTo(x + a, y + b);
      ctx.lineTo(x + a + 0.11, y + b + 0.035);
      ctx.stroke();
    }

    // Occasional tiny props that make the floor feel handcrafted.
    const prop = hash2d(col + 400, row + 800, level.decorSeed);
    if (prop > 0.87) {
      this.#drawFloorProp(ctx, x, y, style, prop, level);
    }
  }

  #drawFloorProp(ctx, x, y, style, seed, level) {
    const p = level.palette;
    const px = x + 0.18 + ((seed * 5) % 0.65);
    const py = y + 0.2 + ((seed * 9) % 0.55);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(seed * 8);
    if (style === "ruins" || style === "swamp") {
      ctx.strokeStyle = withAlpha(p.accentSoft, 0.55);
      ctx.lineWidth = 0.012;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(0, 0.05);
        ctx.quadraticCurveTo((i - 1) * 0.05, -0.04, (i - 1) * 0.08, -0.12);
        ctx.stroke();
      }
      ctx.fillStyle = withAlpha(p.accent, 0.4);
      fillCircle(ctx, 0, -0.08, 0.028);
    } else if (style === "glacier") {
      ctx.fillStyle = withAlpha(p.frost, 0.25);
      ctx.strokeStyle = withAlpha(p.accent2, 0.6);
      ctx.lineWidth = 0.01;
      ctx.beginPath();
      ctx.moveTo(0, 0.1);
      ctx.lineTo(-0.05, -0.08);
      ctx.lineTo(0.02, -0.13);
      ctx.lineTo(0.07, 0.02);
      ctx.fill();
      ctx.stroke();
    } else if (style === "circuit") {
      ctx.fillStyle = withAlpha(p.accent, 0.55);
      ctx.fillRect(-0.03, -0.03, 0.06, 0.06);
      ctx.strokeStyle = withAlpha(p.accent, 0.25);
      ctx.lineWidth = 0.01;
      ctx.beginPath();
      ctx.moveTo(0, 0.03);
      ctx.lineTo(0, 0.14);
      ctx.stroke();
    } else if (style === "candy") {
      ctx.fillStyle = withAlpha(p.accent2, 0.55);
      fillCircle(ctx, 0, 0, 0.045);
      ctx.fillStyle = withAlpha("#fff4dc", 0.5);
      fillCircle(ctx, -0.012, -0.015, 0.014);
    } else if (style === "magma") {
      ctx.fillStyle = withAlpha(p.danger, 0.4);
      fillCircle(ctx, 0, 0, 0.025);
      ctx.strokeStyle = withAlpha(p.danger, 0.28);
      ctx.lineWidth = 0.008;
      ctx.beginPath();
      ctx.arc(0, 0, 0.06, 0, TAU);
      ctx.stroke();
    } else if (style === "abyss") {
      ctx.fillStyle = withAlpha(p.frost, 0.3);
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.07, 0.03, 0, 0, TAU);
      ctx.fill();
    } else if (style === "void") {
      ctx.strokeStyle = withAlpha(p.accent2, 0.38);
      ctx.lineWidth = 0.008;
      starPath(ctx, 0, 0, 4, 0.07, 0.02, seed * 5);
      ctx.stroke();
    } else if (style === "sand") {
      ctx.strokeStyle = withAlpha(p.gold, 0.35);
      ctx.lineWidth = 0.009;
      ctx.beginPath();
      ctx.moveTo(-0.06, 0.04);
      ctx.lineTo(0, -0.06);
      ctx.lineTo(0.06, 0.04);
      ctx.stroke();
    } else if (style === "marble") {
      ctx.fillStyle = withAlpha(p.gold, 0.25);
      ctx.beginPath();
      ctx.moveTo(-0.06, 0);
      ctx.lineTo(0, -0.07);
      ctx.lineTo(0.06, 0);
      ctx.lineTo(0, 0.07);
      ctx.fill();
    }
    ctx.restore();
  }

  #drawSoftBlock(ctx, col, row, level, time, options = {}) {
    const p = level.palette;
    const x = options.at?.x ?? col;
    const y = options.at?.y ?? row;
    const seed = options.seedOverride ?? hash2d(col + 14, row + 29, level.decorSeed);
    const type = p.softStyle;
    const pulse = 0.5 + Math.sin(time * 1.4 + seed * 8) * 0.5;
    const glowStart = this.glowTiles.length;

    ctx.save();
    // Foot shadow.
    ctx.fillStyle = withAlpha(p.shadow, 0.3);
    ellipse(ctx, x + 0.54, y + 0.81, 0.42, 0.14);
    ctx.fill();

    if (type === "crystal") {
      ctx.fillStyle = withAlpha(p.softSide, 0.8);
      ctx.beginPath();
      ctx.moveTo(x + 0.14, y + 0.82);
      ctx.lineTo(x + 0.22, y + 0.32);
      ctx.lineTo(x + 0.4, y + 0.08);
      ctx.lineTo(x + 0.5, y + 0.42);
      ctx.lineTo(x + 0.64, y + 0.18);
      ctx.lineTo(x + 0.82, y + 0.47);
      ctx.lineTo(x + 0.87, y + 0.82);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha(p.accent, 0.35);
      ctx.lineWidth = 0.015;
      ctx.stroke();
      const facet = ctx.createLinearGradient(x + 0.2, y + 0.1, x + 0.8, y + 0.8);
      facet.addColorStop(0, withAlpha(p.frost, 0.72));
      facet.addColorStop(0.5, p.softTop);
      facet.addColorStop(1, p.softFace);
      ctx.fillStyle = facet;
      ctx.beginPath();
      ctx.moveTo(x + 0.22, y + 0.8);
      ctx.lineTo(x + 0.28, y + 0.35);
      ctx.lineTo(x + 0.42, y + 0.16);
      ctx.lineTo(x + 0.52, y + 0.76);
      ctx.lineTo(x + 0.63, y + 0.66);
      ctx.lineTo(x + 0.7, y + 0.29);
      ctx.lineTo(x + 0.8, y + 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha("#ffffff", 0.32);
      ctx.lineWidth = 0.01;
      ctx.beginPath();
      ctx.moveTo(x + 0.42, y + 0.16);
      ctx.lineTo(x + 0.4, y + 0.7);
      ctx.stroke();
      ctx.fillStyle = withAlpha("#ffffff", 0.6);
      fillCircle(ctx, x + 0.33, y + 0.38, 0.025);
      this.glowTiles.push({ x: x + 0.5, y: y + 0.5, size: 0.35, seed, type: "ice" });
    } else if (type === "obsidian") {
      const g = ctx.createLinearGradient(x + 0.1, y + 0.1, x + 0.9, y + 0.9);
      g.addColorStop(0, "#3a2a31");
      g.addColorStop(0.48, p.softFace);
      g.addColorStop(1, "#151014");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + 0.12, y + 0.76);
      ctx.lineTo(x + 0.17, y + 0.23);
      ctx.lineTo(x + 0.48, y + 0.07);
      ctx.lineTo(x + 0.85, y + 0.25);
      ctx.lineTo(x + 0.89, y + 0.76);
      ctx.lineTo(x + 0.54, y + 0.92);
      ctx.closePath();
      ctx.fill();
      outline(ctx, withAlpha(p.danger, 0.34), 0.017);
      ctx.strokeStyle = withAlpha(p.danger, 0.65 + pulse * 0.2);
      ctx.lineWidth = 0.012;
      ctx.beginPath();
      ctx.moveTo(x + 0.31, y + 0.85);
      ctx.lineTo(x + 0.42, y + 0.58);
      ctx.lineTo(x + 0.36, y + 0.41);
      ctx.lineTo(x + 0.59, y + 0.24);
      ctx.stroke();
      ctx.fillStyle = withAlpha(p.danger, 0.12);
      fillCircle(ctx, x + 0.52, y + 0.53, 0.26);
      ctx.fillStyle = withAlpha(p.gold, 0.3 + pulse * 0.2);
      fillCircle(ctx, x + 0.36, y + 0.41, 0.022);
      this.glowTiles.push({ x: x + 0.48, y: y + 0.54, size: 0.3, seed, type: "lava" });
    } else if (type === "server") {
      const g = ctx.createLinearGradient(x + 0.2, y + 0.1, x + 0.8, y + 0.9);
      g.addColorStop(0, p.softTop);
      g.addColorStop(0.55, p.softFace);
      g.addColorStop(1, p.softSide);
      ctx.fillStyle = g;
      roundedRect(ctx, x + 0.1, y + 0.12, 0.8, 0.76, 0.06);
      ctx.fill();
      outline(ctx, withAlpha(p.accent, 0.32), 0.016);
      ctx.fillStyle = withAlpha("#061016", 0.6);
      roundedRect(ctx, x + 0.18, y + 0.2, 0.64, 0.58, 0.035);
      ctx.fill();
      ctx.fillStyle = withAlpha(p.accent, 0.7);
      for (let i = 0; i < 3; i += 1) {
        fillCircle(ctx, x + 0.3, y + 0.36 + i * 0.12, 0.025);
        ctx.strokeStyle = withAlpha(p.accent, 0.35);
        ctx.lineWidth = 0.007;
        ctx.beginPath();
        ctx.moveTo(x + 0.36, y + 0.36 + i * 0.12);
        ctx.lineTo(x + 0.7, y + 0.36 + i * 0.12);
        ctx.stroke();
      }
      ctx.strokeStyle = withAlpha(p.accent2, 0.32);
      ctx.lineWidth = 0.01;
      ctx.strokeRect(x + 0.2, y + 0.22, 0.6, 0.55);
      this.glowTiles.push({ x: x + 0.3, y: y + 0.36, size: 0.19, seed, type: "node" });
    } else if (type === "gum") {
      const g = ctx.createRadialGradient(x + 0.33, y + 0.28, 0.05, x + 0.5, y + 0.52, 0.55);
      g.addColorStop(0, lighten(p.softTop, 0.3));
      g.addColorStop(0.45, p.softFace);
      g.addColorStop(1, p.softSide);
      ctx.fillStyle = g;
      roundedRect(ctx, x + 0.1, y + 0.12, 0.8, 0.76, 0.18);
      ctx.fill();
      ctx.strokeStyle = withAlpha("#fff4e7", 0.3);
      ctx.lineWidth = 0.018;
      ctx.stroke();
      ctx.fillStyle = withAlpha("#ffffff", 0.38);
      ellipse(ctx, x + 0.33, y + 0.3, 0.16, 0.07, -0.5);
      ctx.fill();
      ctx.fillStyle = withAlpha(p.accent2, 0.35);
      for (const [dx, dy, r] of [[0.66, 0.32, 0.05], [0.27, 0.62, 0.045], [0.7, 0.66, 0.03]]) {
        fillCircle(ctx, x + dx, y + dy, r);
      }
      ctx.strokeStyle = withAlpha(p.accent, 0.26);
      ctx.lineWidth = 0.008;
      ctx.beginPath();
      ctx.arc(x + 0.5, y + 0.5, 0.28, 0.3, 2.4);
      ctx.stroke();
    } else if (type === "voidstone") {
      const g = ctx.createLinearGradient(x + 0.2, y + 0.1, x + 0.8, y + 0.9);
      g.addColorStop(0, "#3a2e59");
      g.addColorStop(0.45, "#1e1830");
      g.addColorStop(1, "#090611");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + 0.13, y + 0.72);
      ctx.lineTo(x + 0.21, y + 0.25);
      ctx.lineTo(x + 0.5, y + 0.1);
      ctx.lineTo(x + 0.83, y + 0.29);
      ctx.lineTo(x + 0.88, y + 0.74);
      ctx.lineTo(x + 0.53, y + 0.91);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha(p.accent2, 0.35);
      ctx.lineWidth = 0.014;
      ctx.stroke();
      ctx.fillStyle = withAlpha("#efeaff", 0.35 + pulse * 0.3);
      for (let i = 0; i < 5; i += 1) {
        const a = hash2d(col + i * 9, row + i * 41, level.decorSeed + 8);
        fillCircle(ctx, x + 0.2 + a * 0.6, y + 0.25 + ((a * 7) % 0.5), 0.009 + a * 0.012);
      }
      ctx.strokeStyle = withAlpha(p.accent2, 0.55);
      ctx.lineWidth = 0.011;
      ctx.beginPath();
      ctx.moveTo(x + 0.38, y + 0.68);
      ctx.lineTo(x + 0.5, y + 0.4);
      ctx.lineTo(x + 0.62, y + 0.66);
      ctx.stroke();
      this.glowTiles.push({ x: x + 0.5, y: y + 0.5, size: 0.4, seed, type: "rune" });
    } else if (type === "coral") {
      ctx.fillStyle = withAlpha(p.softSide, 0.8);
      for (let i = 0; i < 4; i += 1) {
        const a = hash2d(col + i * 13, row + i * 17, level.decorSeed + 3);
        ctx.beginPath();
        ctx.ellipse(x + 0.24 + a * 0.5, y + 0.7 - a * 0.22, 0.12, 0.26, a * 1.5, 0, TAU);
        ctx.fill();
      }
      const g = ctx.createLinearGradient(x + 0.2, y + 0.1, x + 0.8, y + 0.9);
      g.addColorStop(0, p.softTop);
      g.addColorStop(0.55, p.softFace);
      g.addColorStop(1, p.softSide);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x + 0.5, y + 0.47, 0.4, 0.38, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = withAlpha(p.accent2, 0.3);
      ctx.lineWidth = 0.014;
      ctx.stroke();
      ctx.fillStyle = withAlpha(p.accent, 0.3);
      for (let i = 0; i < 6; i += 1) {
        const a = hash2d(col + i * 4, row + i * 9, level.decorSeed + 8);
        fillCircle(ctx, x + 0.2 + a * 0.6, y + 0.22 + ((a * 5) % 0.5), 0.02 + a * 0.025);
      }
      ctx.fillStyle = "#ffeedd";
      fillCircle(ctx, x + 0.64, y + 0.3, 0.02);
    } else if (type === "sandstone") {
      const g = ctx.createLinearGradient(x + 0.1, y + 0.1, x + 0.9, y + 0.9);
      g.addColorStop(0, p.softTop);
      g.addColorStop(0.5, p.softFace);
      g.addColorStop(1, p.softSide);
      ctx.fillStyle = g;
      roundedRect(ctx, x + 0.1, y + 0.11, 0.8, 0.77, 0.045);
      ctx.fill();
      outline(ctx, withAlpha(p.wallLine, 0.5), 0.014);
      ctx.fillStyle = withAlpha(p.floorC, 0.22);
      ctx.fillRect(x + 0.1, y + 0.47, 0.8, 0.025);
      ctx.strokeStyle = withAlpha(p.gold, 0.4);
      ctx.lineWidth = 0.011;
      ctx.beginPath();
      ctx.moveTo(x + 0.22, y + 0.27);
      ctx.lineTo(x + 0.37, y + 0.34);
      ctx.lineTo(x + 0.52, y + 0.26);
      ctx.lineTo(x + 0.67, y + 0.36);
      ctx.lineTo(x + 0.8, y + 0.27);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(p.wallLine, 0.3);
      ctx.beginPath();
      ctx.moveTo(x + 0.26, y + 0.65);
      ctx.lineTo(x + 0.38, y + 0.72);
      ctx.lineTo(x + 0.5, y + 0.64);
      ctx.stroke();
      // Sand trickle.
      ctx.fillStyle = withAlpha(p.softTop, 0.5);
      ctx.fillRect(x + 0.7, y + 0.88, 0.03, 0.05);
    } else if (type === "barrel") {
      const g = ctx.createLinearGradient(x + 0.16, y + 0.15, x + 0.8, y + 0.9);
      g.addColorStop(0, lighten(p.softTop, 0.2));
      g.addColorStop(0.45, p.softFace);
      g.addColorStop(1, p.softSide);
      ctx.fillStyle = g;
      roundedRect(ctx, x + 0.2, y + 0.12, 0.6, 0.78, 0.14);
      ctx.fill();
      ctx.strokeStyle = withAlpha(p.shadow, 0.45);
      ctx.lineWidth = 0.015;
      ctx.stroke();
      ctx.fillStyle = withAlpha("#101712", 0.6);
      ellipse(ctx, x + 0.5, y + 0.15, 0.26, 0.07);
      ctx.fill();
      ctx.strokeStyle = withAlpha(p.accent, 0.6);
      ctx.lineWidth = 0.018;
      ctx.beginPath();
      ctx.moveTo(x + 0.34, y + 0.4);
      ctx.lineTo(x + 0.5, y + 0.66);
      ctx.lineTo(x + 0.66, y + 0.4);
      ctx.stroke();
      ctx.fillStyle = withAlpha(p.accent, 0.5 + pulse * 0.3);
      fillCircle(ctx, x + 0.5, y + 0.55, 0.045);
      ctx.fillStyle = withAlpha(p.accent, 0.18);
      ctx.beginPath();
      ctx.ellipse(x + 0.5, y + 0.89, 0.34, 0.1, 0, 0, TAU);
      ctx.fill();
      this.glowTiles.push({ x: x + 0.5, y: y + 0.7, size: 0.3, seed, type: "toxic" });
    } else if (type === "urn") {
      ctx.fillStyle = p.softSide;
      ctx.beginPath();
      ctx.moveTo(x + 0.3, y + 0.2);
      ctx.quadraticCurveTo(x + 0.1, y + 0.48, x + 0.22, y + 0.86);
      ctx.lineTo(x + 0.78, y + 0.86);
      ctx.quadraticCurveTo(x + 0.9, y + 0.48, x + 0.7, y + 0.2);
      ctx.closePath();
      ctx.fill();
      const g = ctx.createLinearGradient(x + 0.2, y + 0.2, x + 0.8, y + 0.8);
      g.addColorStop(0, p.softTop);
      g.addColorStop(0.5, p.softFace);
      g.addColorStop(1, p.softSide);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + 0.32, y + 0.23);
      ctx.quadraticCurveTo(x + 0.15, y + 0.5, x + 0.25, y + 0.83);
      ctx.lineTo(x + 0.75, y + 0.83);
      ctx.quadraticCurveTo(x + 0.85, y + 0.5, x + 0.68, y + 0.23);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha(p.gold, 0.55);
      ctx.lineWidth = 0.014;
      ctx.stroke();
      ctx.fillStyle = withAlpha(p.gold, 0.35);
      ctx.fillRect(x + 0.29, y + 0.44, 0.42, 0.035);
      ctx.fillRect(x + 0.3, y + 0.63, 0.4, 0.025);
      ctx.strokeStyle = withAlpha(p.gold, 0.4);
      ctx.beginPath();
      ctx.arc(x + 0.5, y + 0.55, 0.09, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = withAlpha(p.gold, 0.3);
      fillCircle(ctx, x + 0.5, y + 0.55, 0.025);
      ctx.fillStyle = withAlpha("#16100f", 0.65);
      ellipse(ctx, x + 0.5, y + 0.21, 0.18, 0.05);
      ctx.fill();
    } else {
      // Wooden / stone crate.
      const g = ctx.createLinearGradient(x + 0.1, y + 0.1, x + 0.9, y + 0.9);
      g.addColorStop(0, lighten(p.softTop, 0.16));
      g.addColorStop(0.5, p.softFace);
      g.addColorStop(1, p.softSide);
      ctx.fillStyle = g;
      roundedRect(ctx, x + 0.09, y + 0.12, 0.82, 0.76, 0.055);
      ctx.fill();
      outline(ctx, withAlpha(p.shadow, 0.55), 0.018);
      ctx.strokeStyle = withAlpha(p.softSide, 0.85);
      ctx.lineWidth = 0.022;
      ctx.beginPath();
      ctx.moveTo(x + 0.1, y + 0.39);
      ctx.lineTo(x + 0.9, y + 0.39);
      ctx.moveTo(x + 0.1, y + 0.67);
      ctx.lineTo(x + 0.9, y + 0.67);
      ctx.moveTo(x + 0.33, y + 0.13);
      ctx.lineTo(x + 0.33, y + 0.87);
      ctx.moveTo(x + 0.67, y + 0.13);
      ctx.lineTo(x + 0.67, y + 0.87);
      ctx.stroke();
      ctx.fillStyle = withAlpha("#dec99f", 0.3);
      ctx.fillRect(x + 0.12, y + 0.15, 0.76, 0.035);
      // Metal corners.
      ctx.fillStyle = withAlpha(p.gold, 0.42);
      for (const [cx, cy] of [[0.11, 0.14], [0.89, 0.14], [0.11, 0.86], [0.89, 0.86]]) {
        ctx.save();
        ctx.translate(x + cx, y + cy);
        ctx.rotate(seed * 5);
        ctx.fillRect(-0.05, -0.015, 0.1, 0.03);
        ctx.fillRect(-0.015, -0.05, 0.03, 0.1);
        ctx.restore();
      }
      ctx.strokeStyle = withAlpha(p.softTop, 0.55);
      ctx.lineWidth = 0.009;
      ctx.beginPath();
      ctx.moveTo(x + 0.45, y + 0.44);
      ctx.lineTo(x + 0.53, y + 0.52);
      ctx.lineTo(x + 0.46, y + 0.59);
      ctx.stroke();
    }
    ctx.restore();
    // Soft blocks are rebuilt every frame; don't accumulate their local glows.
    this.glowTiles.length = glowStart;
  }

  #drawHardWall(ctx, col, row, level, seed, { border = false } = {}) {
    const p = level.palette;
    const x = col;
    const y = row;
    const style = p.style;
    const detail = hash2d(col, row, level.decorSeed);
    const offset = hash2d(col + 3, row + 5, level.decorSeed + 14) * 0.04;

    // Contact shadow.
    const shadow = ctx.createRadialGradient(x + 0.58, y + 0.82, 0.02, x + 0.58, y + 0.82, 0.75);
    shadow.addColorStop(0, withAlpha(p.shadow, 0.44));
    shadow.addColorStop(1, withAlpha(p.shadow, 0));
    ctx.fillStyle = shadow;
    ctx.fillRect(x - 0.1, y + 0.2, 1.25, 0.9);

    // Side face (lower-right).
    ctx.fillStyle = p.wallSide;
    ctx.beginPath();
    ctx.moveTo(x + 0.08, y + 0.23);
    ctx.lineTo(x + 0.96, y + 0.23);
    ctx.lineTo(x + 0.96, y + 0.97);
    ctx.lineTo(x + 0.12, y + 0.97);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha(p.shadow, 0.55);
    ctx.lineWidth = 0.018;
    ctx.stroke();

    // Top face.
    const topGrad = ctx.createLinearGradient(x + 0.05, y + 0.02, x + 0.9, y + 0.9);
    topGrad.addColorStop(0, p.wallTop);
    topGrad.addColorStop(0.48, p.wallFace);
    topGrad.addColorStop(1, darken(p.wallFace, 0.16));
    ctx.fillStyle = topGrad;
    roundedRect(ctx, x + 0.035 + offset, y + 0.025, 0.915, 0.84, 0.09);
    ctx.fill();
    ctx.strokeStyle = withAlpha(p.wallLine, 0.9);
    ctx.lineWidth = 0.022;
    ctx.stroke();

    // Top bevel highlight.
    ctx.strokeStyle = withAlpha(lighten(p.wallTop, 0.25), 0.5);
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(x + 0.12, y + 0.08);
    ctx.lineTo(x + 0.84, y + 0.08);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(p.shadow, 0.35);
    ctx.beginPath();
    ctx.moveTo(x + 0.1, y + 0.82);
    ctx.lineTo(x + 0.9, y + 0.82);
    ctx.stroke();

    // Face inset.
    ctx.fillStyle = withAlpha(p.wallDeep, 0.18);
    roundedRect(ctx, x + 0.12, y + 0.14, 0.74, 0.61, 0.06);
    ctx.fill();
    ctx.strokeStyle = withAlpha(p.wallLine, 0.55);
    ctx.lineWidth = 0.012;
    ctx.stroke();

    // Style-specific wall motif.
    if (style === "ruins") {
      ctx.strokeStyle = withAlpha(p.wallLine, 0.8);
      ctx.lineWidth = 0.014;
      ctx.beginPath();
      ctx.moveTo(x + 0.12, y + 0.4);
      ctx.lineTo(x + 0.88, y + 0.4);
      ctx.moveTo(x + 0.3, y + 0.14);
      ctx.lineTo(x + 0.3, y + 0.4);
      ctx.moveTo(x + 0.62, y + 0.4);
      ctx.lineTo(x + 0.62, y + 0.75);
      ctx.stroke();
      // Moss.
      ctx.fillStyle = withAlpha(p.accentSoft, 0.35 + detail * 0.2);
      for (let i = 0; i < 3; i += 1) {
        const a = hash2d(col + i * 17, row + i * 19, level.decorSeed + 55);
        ellipse(ctx, x + 0.16 + a * 0.65, y + 0.18 + i * 0.06, 0.1 + a * 0.09, 0.03 + a * 0.02, a);
        ctx.fill();
      }
      this.runes.push({ x: x + 0.5, y: y + 0.54, rune: detail, color: p.accent, size: 0.16 });
    } else if (style === "magma") {
      ctx.strokeStyle = withAlpha(p.danger, 0.5 + detail * 0.35);
      ctx.lineWidth = 0.018;
      ctx.beginPath();
      ctx.moveTo(x + 0.19, y + 0.7);
      ctx.lineTo(x + 0.35, y + 0.53);
      ctx.lineTo(x + 0.3, y + 0.32);
      ctx.lineTo(x + 0.52, y + 0.23);
      ctx.moveTo(x + 0.55, y + 0.7);
      ctx.lineTo(x + 0.6, y + 0.5);
      ctx.lineTo(x + 0.82, y + 0.44);
      ctx.stroke();
      ctx.fillStyle = withAlpha(p.danger, 0.14);
      ctx.beginPath();
      ctx.arc(x + 0.52, y + 0.73, 0.2, 0, TAU);
      ctx.fill();
      this.runes.push({ x: x + 0.52, y: y + 0.5, rune: detail, color: p.danger, size: 0.22 });
    } else if (style === "glacier") {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + 0.16, y + 0.16);
      ctx.lineTo(x + 0.76, y + 0.16);
      ctx.lineTo(x + 0.85, y + 0.38);
      ctx.lineTo(x + 0.62, y + 0.74);
      ctx.lineTo(x + 0.21, y + 0.72);
      ctx.closePath();
      ctx.fillStyle = withAlpha(p.frost, 0.08);
      ctx.fill();
      ctx.strokeStyle = withAlpha(p.frost, 0.32);
      ctx.lineWidth = 0.012;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 0.33, y + 0.18);
      ctx.lineTo(x + 0.5, y + 0.53);
      ctx.lineTo(x + 0.7, y + 0.65);
      ctx.strokeStyle = withAlpha("#ffffff", 0.22);
      ctx.stroke();
      ctx.restore();
      this.runes.push({ x: x + 0.5, y: y + 0.5, rune: detail, color: p.frost, size: 0.2 });
    } else if (style === "circuit") {
      ctx.strokeStyle = withAlpha(p.accent, 0.55);
      ctx.lineWidth = 0.014;
      ctx.beginPath();
      ctx.moveTo(x + 0.18, y + 0.33);
      ctx.lineTo(x + 0.45, y + 0.33);
      ctx.lineTo(x + 0.45, y + 0.65);
      ctx.lineTo(x + 0.8, y + 0.65);
      ctx.stroke();
      ctx.fillStyle = withAlpha(p.accent2, 0.7);
      fillCircle(ctx, x + 0.18, y + 0.33, 0.026);
      fillCircle(ctx, x + 0.8, y + 0.65, 0.026);
      ctx.strokeStyle = withAlpha(p.accent2, 0.5);
      ctx.strokeRect(x + 0.6, y + 0.23, 0.16, 0.16);
      this.runes.push({ x: x + 0.45, y: y + 0.5, rune: detail, color: p.accent, size: 0.18 });
    } else if (style === "candy") {
      ctx.save();
      ctx.beginPath();
      roundedRect(ctx, x + 0.15, y + 0.15, 0.7, 0.6, 0.1);
      ctx.clip();
      ctx.strokeStyle = withAlpha("#fff2e0", 0.28);
      ctx.lineWidth = 0.045;
      for (let i = -2; i < 5; i += 1) {
        ctx.beginPath();
        ctx.moveTo(x + i * 0.22, y + 0.12);
        ctx.lineTo(x + i * 0.22 + 0.35, y + 0.78);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = withAlpha("#fff7e9", 0.25);
      ellipse(ctx, x + 0.43, y + 0.35, 0.16, 0.06, -0.4);
      ctx.fill();
    } else if (style === "void") {
      ctx.fillStyle = withAlpha("#0b0712", 0.35);
      roundedRect(ctx, x + 0.18, y + 0.18, 0.64, 0.55, 0.06);
      ctx.fill();
      ctx.strokeStyle = withAlpha(p.accent2, 0.5);
      ctx.lineWidth = 0.013;
      starPath(ctx, x + 0.5, y + 0.45, 5, 0.17, 0.07, detail * TAU);
      ctx.stroke();
      ctx.fillStyle = withAlpha(p.frost, 0.3);
      for (let i = 0; i < 4; i += 1) {
        const a = hash2d(col + i * 4, row + i * 71, level.decorSeed + 19);
        fillCircle(ctx, x + 0.2 + a * 0.6, y + 0.22 + ((a * 5) % 0.5), 0.009);
      }
      this.runes.push({ x: x + 0.5, y: y + 0.46, rune: detail, color: p.accent2, size: 0.2 });
    } else if (style === "abyss") {
      ctx.fillStyle = withAlpha(p.accentSoft, 0.25);
      for (let i = 0; i < 4; i += 1) {
        const a = hash2d(col + i * 9, row + i * 37, level.decorSeed + 4);
        ellipse(ctx, x + 0.2 + a * 0.55, y + 0.21 + a * 0.35, 0.06 + a * 0.05, 0.03 + a * 0.02, a);
        ctx.fill();
      }
      ctx.strokeStyle = withAlpha(p.frost, 0.22);
      ctx.lineWidth = 0.012;
      ctx.beginPath();
      ctx.arc(x + 0.5, y + 0.5, 0.22, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = withAlpha(p.frost, 0.22);
      fillCircle(ctx, x + 0.5, y + 0.5, 0.045);
    } else if (style === "sand") {
      ctx.strokeStyle = withAlpha(p.wallDeep, 0.65);
      ctx.lineWidth = 0.013;
      ctx.beginPath();
      ctx.moveTo(x + 0.2, y + 0.35);
      ctx.lineTo(x + 0.36, y + 0.28);
      ctx.lineTo(x + 0.5, y + 0.38);
      ctx.lineTo(x + 0.67, y + 0.28);
      ctx.lineTo(x + 0.8, y + 0.38);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(p.gold, 0.35);
      ctx.beginPath();
      ctx.moveTo(x + 0.27, y + 0.55);
      ctx.lineTo(x + 0.42, y + 0.48);
      ctx.lineTo(x + 0.56, y + 0.56);
      ctx.lineTo(x + 0.72, y + 0.48);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(p.wallLine, 0.3);
      ctx.beginPath();
      ctx.moveTo(x + 0.12, y + 0.7);
      ctx.lineTo(x + 0.88, y + 0.7);
      ctx.stroke();
    } else if (style === "swamp") {
      ctx.fillStyle = withAlpha(p.accent, 0.17);
      ctx.beginPath();
      ctx.ellipse(x + 0.46, y + 0.7, 0.33, 0.12, 0.1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = withAlpha(p.accentSoft, 0.4);
      for (let i = 0; i < 4; i += 1) {
        const a = hash2d(col + i * 17, row + i * 13, level.decorSeed + 44);
        fillCircle(ctx, x + 0.2 + a * 0.6, y + 0.78 + a * 0.05, 0.025 + a * 0.02);
      }
      ctx.strokeStyle = withAlpha(p.wallLine, 0.5);
      ctx.lineWidth = 0.012;
      ctx.strokeRect(x + 0.24, y + 0.24, 0.52, 0.3);
      ctx.fillStyle = withAlpha(p.accent, 0.18);
      fillCircle(ctx, x + 0.5, y + 0.39, 0.08);
    } else if (style === "marble") {
      ctx.strokeStyle = withAlpha(p.gold, 0.45);
      ctx.lineWidth = 0.011;
      ctx.beginPath();
      ctx.moveTo(x + 0.2, y + 0.5);
      ctx.bezierCurveTo(x + 0.32, y + 0.28, x + 0.4, y + 0.68, x + 0.5, y + 0.45);
      ctx.bezierCurveTo(x + 0.6, y + 0.25, x + 0.7, y + 0.65, x + 0.8, y + 0.38);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(p.gold, 0.25);
      ctx.strokeRect(x + 0.28, y + 0.28, 0.44, 0.37);
      ctx.fillStyle = withAlpha(p.gold, 0.45);
      fillCircle(ctx, x + 0.5, y + 0.46, 0.035);
      this.runes.push({ x: x + 0.5, y: y + 0.46, rune: detail, color: p.gold, size: 0.16 });
    }

    // Border walls get a darker cap.
    if (border) {
      ctx.fillStyle = withAlpha(p.shadow, 0.2);
      ctx.fillRect(x, y, 1, 0.04);
    }

    // Rim light from the level accent.
    ctx.strokeStyle = withAlpha(p.accent, 0.12 + detail * 0.1);
    ctx.lineWidth = 0.01;
    ctx.beginPath();
    ctx.moveTo(x + 0.1, y + 0.05);
    ctx.lineTo(x + 0.88, y + 0.05);
    ctx.stroke();
  }

  render(game, time, dt) {
    if (!game.level || !this.ctx) return;
    this.syncLevel(game);
    if (!this.cssW) this.resize();
    const ctx = this.ctx;
    const palette = game.level.palette;
    this.time = time;
    this._frame += 1;
    if (!(this._frame % 2)) {
      this.ambient.update(dt, time, this.quality);
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    const shake = game.shakeAmount || 0;
    let shakeX = 0;
    let shakeY = 0;
    if (shake > 0.001) {
      const s = shake * this.tile * 0.17;
      shakeX = Math.sin(time * 73 + this._shakeSeed) * s + (Math.random() - 0.5) * s * 0.6;
      shakeY = Math.cos(time * 61 + this._shakeSeed) * s + (Math.random() - 0.5) * s * 0.6;
    }

    ctx.fillStyle = palette.bgBottom;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.drawImage(this.staticCanvas, 0, 0, this.cssW, this.cssH);
    ctx.restore();

    ctx.save();
    ctx.translate(this.offsetX + shakeX, this.offsetY + shakeY);
    ctx.scale(this.tile, this.tile);

    this.#drawFloorAnimation(ctx, game, palette, time);
    this.ambient.draw(ctx, time);
    this.#drawFloorHazards(ctx, game, palette, time);

    const { cols, rows } = game.level;
    // Arena edge inner shadow.
    const edge = ctx.createLinearGradient(0, 0, 0, rows);
    edge.addColorStop(0, "rgba(0,0,0,.38)");
    edge.addColorStop(0.08, "rgba(0,0,0,0)");
    edge.addColorStop(0.92, "rgba(0,0,0,0)");
    edge.addColorStop(1, "rgba(0,0,0,.32)");
    ctx.fillStyle = edge;
    ctx.fillRect(1, 0.0, cols - 2, rows);

    // Portal (under actors).
    if (game.level.exit) {
      drawPortal(
        ctx,
        game.level.exit.col + 0.5,
        game.level.exit.row + 0.5,
        palette,
        time,
        game.portalActive,
        game.portalAppear
      );
    }

    // Soft blocks (pre-rendered variants) and pickups.
    if (!this.softCache || this.softCacheSeed !== game.level.seed) this.#buildSoftCache(game.level);
    const softVariants = this.softCache?.length || 1;
    for (let row = 1; row < rows - 1; row += 1) {
      for (let col = 1; col < cols - 1; col += 1) {
        const index = row * cols + col;
        if (game.level.tiles[index] === TILE.BLOCK) {
          const variant = (game.level.tileSeeds[index] >>> 0) % softVariants;
          const sprite = this.softCache?.[variant];
          if (sprite) {
            ctx.drawImage(sprite, col, row, 1, 1);
          } else {
            this.#drawSoftBlock(ctx, col, row, game.level, time);
          }
        }
      }
    }

    // Pickups on the floor.
    for (const pickup of game.pickups) {
      if (!pickup.revealed) continue;
      drawPickup(ctx, pickup, palette, time, { appear: pickup.appear ?? 1 });
    }
    if (game.level.mountEgg && !game.mountEggUsed) {
      drawEgg(ctx, game.level.mountEgg, palette, time);
    }

    // Bombs.
    for (const bomb of game.bombs) {
      drawBomb(ctx, bomb, palette, time, this.tile);
    }

    // Bomb placement preview.
    for (const player of game.players) {
      if (!player.alive) continue;
      if (game.state === "playing" && player.canPlaceBomb) {
        const col = Math.floor(player.x);
        const row = Math.floor(player.y);
        if (game.bombAt(col, row)) continue;
        ctx.save();
        ctx.globalAlpha = 0.2 + Math.sin(time * 4) * 0.05;
        ctx.strokeStyle = player.index === 0 ? palette.accent : palette.accent2;
        ctx.lineWidth = 0.018;
        ctx.setLineDash([0.07, 0.08]);
        ctx.lineDashOffset = -time * 0.3;
        roundedRect(ctx, col + 0.15, row + 0.15, 0.7, 0.7, 0.08);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Enemies + players sorted by vertical position for a soft 2.5D feel.
    const actors = [];
    for (const enemy of game.enemies) {
      if (enemy.alive || enemy.dying > 0) actors.push({ kind: "enemy", entity: enemy, y: enemy.y });
    }
    for (const player of game.players) {
      if (player.alive) actors.push({ kind: "player", entity: player, y: player.y });
    }
    actors.sort((a, b) => a.y - b.y);

    for (const actor of actors) {
      if (actor.kind === "enemy") {
        const enemy = actor.entity;
        if (enemy.type === "turret" && enemy.turretCharge > 0.25) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = withAlpha(palette.danger, 0.2 + enemy.turretCharge * 0.5);
          ctx.lineWidth = 0.018;
          ctx.beginPath();
          ctx.arc(enemy.x, enemy.y, 0.5 - enemy.turretCharge * 0.15, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
        drawEnemy(ctx, enemy, palette, time);
      } else {
        drawHero(ctx, actor.entity, palette, time, { showTag: game.mode === "versus" });
      }
    }

    // Projectiles.
    for (const projectile of game.projectiles) {
      drawProjectile(ctx, projectile, palette, time);
    }

    // Explosion cells.
    for (const explosion of game.explosions) {
      for (const cell of explosion.cells) {
        drawFlameCell(ctx, cell, palette, time, this.tile);
      }
      if (explosion.showRing) {
        const t = clamp(explosion.life / explosion.maxLife, 0, 1);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = withAlpha(palette.gold, t * 0.24);
        ctx.lineWidth = 0.03 * t;
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, (1 - t) * 1.4 + 0.3, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Firetail hazards.
    for (const fire of game.fireHazards) {
      drawTrailFire(ctx, fire, palette, time);
    }

    // Additive rings (pickup, explosion accents).
    for (const ring of game.rings) {
      drawEffectRing(ctx, ring);
    }

    // Particles & floating score text.
    game.particles.draw(ctx, palette);
    game.floatingTexts.draw(ctx);

    // Lighting/vignette.
    this.#drawLighting(ctx, game, palette, time);

    // If the player is waiting on a portal, hint with a directional chevron.
    this.#drawExitHint(ctx, game, palette, time);

    ctx.restore();

    // Cinematic flashes.
    if (game.flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = clamp(game.flash, 0, 1) * 0.65;
      ctx.fillStyle = game.flashColor || "#ffffff";
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      ctx.restore();
    }

    // Outer screen vignette.
    const vignette = ctx.createRadialGradient(
      this.cssW * 0.5,
      this.cssH * 0.48,
      this.cssH * 0.28,
      this.cssW * 0.5,
      this.cssH * 0.52,
      Math.max(this.cssW, this.cssH) * 0.7
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(1,4,9,.34)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
  }

  #drawFloorAnimation(ctx, game, palette, time) {
    const { cols, rows } = game.level;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // Large, slowly drifting colour pools give the arena atmospheric depth.
    const pools = [
      {
        x: cols * (0.24 + Math.sin(time * 0.035) * 0.04),
        y: rows * (0.36 + Math.cos(time * 0.03) * 0.035),
        r: 5.5,
        color: palette.hazeA,
        alpha: 0.055
      },
      {
        x: cols * (0.74 + Math.cos(time * 0.028) * 0.04),
        y: rows * (0.64 + Math.sin(time * 0.025) * 0.04),
        r: 6.2,
        color: palette.hazeB,
        alpha: 0.035
      }
    ];
    for (const pool of pools) {
      const gradient = ctx.createRadialGradient(pool.x, pool.y, 0.1, pool.x, pool.y, pool.r);
      gradient.addColorStop(0, withAlpha(pool.color, pool.alpha));
      gradient.addColorStop(0.6, withAlpha(pool.color, pool.alpha * 0.3));
      gradient.addColorStop(1, withAlpha(pool.color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, cols, rows);
    }
    for (const glow of this.glowTiles) {
      const pulse = 0.25 + Math.sin(time * 1.2 + glow.seed * 10) * 0.11;
      let color = palette.accent;
      if (glow.type === "lava") color = palette.danger;
      else if (glow.type === "ice") color = palette.frost;
      else if (glow.type === "toxic") color = palette.accent;
      else if (glow.type === "node") color = palette.accent2;
      const gradient = ctx.createRadialGradient(glow.x, glow.y, 0.01, glow.x, glow.y, glow.size);
      gradient.addColorStop(0, withAlpha(color, pulse * 0.22));
      gradient.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(glow.x, glow.y, glow.size, 0, TAU);
      ctx.fill();
    }
    for (const rune of this.runes) {
      const pulse = 0.2 + Math.sin(time * 1.8 + rune.rune * 21) * 0.12;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = rune.color;
      ctx.lineWidth = 0.012;
      ctx.save();
      ctx.translate(rune.x, rune.y);
      ctx.rotate(Math.sin(time * 0.3 + rune.rune * 6) * 0.08);
      const s = rune.size;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.55, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.55, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, 0);
      ctx.lineTo(s * 0.35, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  #drawFloorHazards(ctx, game, palette, time) {
    // Subtle darkening around the level edges, plus a scan of the portal area.
    if (game.portalActive) {
      const x = game.level.exit.col + 0.5;
      const y = game.level.exit.row + 0.5;
      const gradient = ctx.createRadialGradient(x, y, 0.05, x, y, 1.0);
      gradient.addColorStop(0, withAlpha(palette.accent, 0.08));
      gradient.addColorStop(1, withAlpha(palette.accent, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    }
  }

  #drawLighting(ctx, game, palette, time) {
    // Called while the world transform is active: all coordinates are tiles.
    const { cols, rows } = game.level;
    ctx.save();
    const cx = cols / 2;
    const cy = rows / 2;
    if (palette.fog > 0.24) {
      const fog = palette.fog;
      const grad = ctx.createRadialGradient(cx, cy, rows * 0.18, cx, cy, Math.max(cols, rows) * 0.64);
      grad.addColorStop(0, "rgba(2,6,14,0)");
      grad.addColorStop(0.65, `rgba(2,6,14,${fog * 0.16})`);
      grad.addColorStop(1, `rgba(1,4,10,${fog * 0.45})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cols, rows);
    }
    // Warm blooms on active lights.
    ctx.globalCompositeOperation = "lighter";
    const lights = [];
    for (const bomb of game.bombs) lights.push({ x: bomb.x, y: bomb.y, r: 0.7, c: palette.danger, a: 0.035 });
    if (game.portalActive && game.level.exit) {
      lights.push({ x: game.level.exit.col + 0.5, y: game.level.exit.row + 0.5, r: 1.0, c: palette.accent, a: 0.08 });
    }
    for (const p of game.players) {
      if (p.alive) lights.push({ x: p.x, y: p.y, r: 0.85, c: p.index === 0 ? palette.accent : palette.accent2, a: 0.035 });
    }
    for (const light of lights) {
      const g = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.r);
      g.addColorStop(0, withAlpha(light.c, light.a));
      g.addColorStop(0.5, withAlpha(light.c, light.a * 0.3));
      g.addColorStop(1, withAlpha(light.c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(light.x, light.y, light.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  #drawExitHint(ctx, game, palette, time) {
    if (!game.portalActive || !game.players[0]?.alive) return;
    const player = game.players[0];
    const exit = game.level.exit;
    if (!exit) return;
    const dx = exit.col + 0.5 - player.x;
    const dy = exit.row + 0.5 - player.y;
    if (Math.hypot(dx, dy) < 2.2) return;
    // Only draw the hint when the portal is off-screen-ish is irrelevant on a
    // fixed board; instead pulse a faint line along the shortest cardinal route.
    if (Math.abs(dx) > Math.abs(dy)) {
      const dir = Math.sign(dx);
      ctx.save();
      ctx.globalAlpha = 0.18 + Math.sin(time * 3) * 0.08;
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 0.012;
      const startX = player.x + dir * 0.55;
      ctx.beginPath();
      ctx.moveTo(startX, player.y);
      ctx.lineTo(startX + dir * 0.28, player.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export class MenuScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.time = 0;
    this.palette = null;
    this.stars = [];
    this.bombs = [];
    this._resizeObserver = null;
    this.resize();
  }

  attachResizeObserver() {
    if (typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.canvas);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.#seed();
  }

  #seed() {
    const rng = new RNG(81127);
    this.stars = Array.from({ length: 26 }, () => ({
      x: rng.next(),
      y: rng.next(),
      r: 0.5 + rng.next() * 1.8,
      phase: rng.next() * TAU,
      speed: 0.2 + rng.next() * 0.6
    }));
    this.bombs = [
      { x: 0.74, y: 0.28, scale: 0.6, phase: 0.2 },
      { x: 0.22, y: 0.63, scale: 0.34, phase: 2.1 },
      { x: 0.86, y: 0.72, scale: 0.26, phase: 4.2 }
    ];
  }

  setPalette(palette) {
    this.palette = palette;
  }

  render(time) {
    if (!this.width) this.resize();
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    this.time = time;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const palette = this.palette || {
      bgTop: "#061018",
      bgMid: "#08131d",
      bgBottom: "#04080d",
      accent: "#61f7c8",
      accent2: "#ff8b54",
      danger: "#ff5c8d",
      glow: "#6ef9d0",
      floorA: "#142c33",
      floorB: "#1b3941",
      floorC: "#0d2027",
      wallTop: "#22434a",
      wallFace: "#16323a",
      wallSide: "#0a1c24",
      wallLine: "#2f5b61",
      softTop: "#48766c",
      softFace: "#2c4c47",
      wallRune: "#61f7c8",
      gold: "#ffd479",
      white: "#f8f2e6",
      shadow: "#02060a",
      fog: 0.2
    };

    // Halo.
    const halo = ctx.createRadialGradient(w * 0.52, h * 0.45, 10, w * 0.52, h * 0.5, w * 0.65);
    halo.addColorStop(0, withAlpha(palette.accent, 0.12));
    halo.addColorStop(0.45, withAlpha(palette.accent2, 0.045));
    halo.addColorStop(1, withAlpha(palette.accent, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    // Stars / embers.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const star of this.stars) {
      const tw = 0.4 + Math.sin(time * star.speed + star.phase) * 0.35;
      ctx.globalAlpha = tw * 0.5;
      ctx.fillStyle = palette.glow;
      ctx.beginPath();
      ctx.arc(star.x * w, star.y * h, star.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Orbit rings.
    ctx.save();
    ctx.translate(w * 0.52, h * 0.48);
    ctx.strokeStyle = withAlpha(palette.accent, 0.13);
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.ellipse(0, 0, w * (0.28 + i * 0.07), h * (0.2 + i * 0.06), -0.3 + i * 0.18, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    const scale = Math.min(w / 430, h / 500);
    const baseY = h * 0.61;
    ctx.save();
    ctx.translate(w * 0.5, baseY);
    ctx.scale(scale, scale);

    // Platform.
    const platform = ctx.createRadialGradient(0, 90, 5, 0, 90, 170);
    platform.addColorStop(0, withAlpha(palette.accent, 0.26));
    platform.addColorStop(1, withAlpha(palette.accent, 0));
    ctx.fillStyle = platform;
    ctx.beginPath();
    ctx.ellipse(0, 88, 185, 54, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(palette.accent, 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 86, 130, 27, 0, 0, TAU);
    ctx.stroke();

    // Decorative runes.
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * TAU + time * 0.03;
      ctx.fillStyle = withAlpha(palette.accent, 0.28 + Math.sin(time * 2 + i) * 0.14);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 157, 88 + Math.sin(a) * 35, 1.8, 0, TAU);
      ctx.fill();
    }

    // Portal behind the hero. Sprite art is authored in tile units, so the
    // stage composes it with an explicit art scale on top of the stage scale.
    ctx.save();
    ctx.translate(142, -48);
    ctx.scale(112, 112);
    drawPortal(ctx, 0, 0, palette, time, true, 1);
    ctx.restore();

    // P1 hero.
    const hero = {
      index: 0,
      x: 0,
      y: 0,
      radius: 0.3,
      dir: { x: 1, y: 0 },
      moving: false,
      animTime: time,
      armor: 1,
      invulnerable: 0,
      powers: new Set(["magnet"]),
      speedFactor: 1,
      opacity: 1
    };
    ctx.save();
    ctx.translate(0, 15);
    ctx.scale(148, 148);
    drawHero(ctx, hero, palette, time, { showTag: false });
    ctx.restore();

    // Two little enemies flanking.
    const crawler = {
      type: "crawler",
      def: {
        key: "crawler",
        name: "Crawler",
        color: "#79efa4",
        glyph: "●"
      },
      x: 0,
      y: 0,
      size: 0.78,
      z: 0,
      opacity: 1,
      anim: time,
      phase: 1.2,
      dir: { x: -1, y: 0 },
      health: 1,
      maxHealth: 1,
      alive: true,
      dying: 0,
      hitFlash: 0,
      attackState: "idle",
      turretCharge: 0
    };
    ctx.save();
    ctx.translate(-106, 52);
    ctx.scale(102, 102);
    drawEnemy(ctx, crawler, palette, time);
    ctx.restore();

    ctx.save();
    ctx.translate(106, 66);
    ctx.scale(92, 92);
    drawEnemy(
      ctx,
      {
        ...crawler,
        type: "hunter",
        phase: 3.8,
        dir: { x: -1, y: 0 },
        def: { key: "hunter", name: "Hunter", color: "#ff7a66", glyph: "◉" }
      },
      palette,
      time
    );
    ctx.restore();

    // Floating bombs.
    const bombSpots = [
      { x: -188, y: -54, scale: 74, phase: 0.2 },
      { x: 182, y: -102, scale: 44, phase: 2.1 },
      { x: -142, y: -150, scale: 30, phase: 4.2 }
    ];
    for (const bomb of bombSpots) {
      ctx.save();
      ctx.translate(bomb.x, bomb.y);
      ctx.scale(bomb.scale, bomb.scale);
      const fake = {
        x: 0,
        y: 0,
        z: 0,
        seed: bomb.phase * 5,
        mode: "normal",
        kind: "normal",
        kickDirection: null
      };
      drawBomb(ctx, fake, palette, time + bomb.phase, 1);
      ctx.restore();
    }

    // A few drifting light motes in front of the cast.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 12; i += 1) {
      const a = time * 0.14 + i * 1.9;
      const x = Math.cos(a) * (110 + (i % 4) * 20);
      const y = 20 + Math.sin(a * 1.3) * (52 + (i % 3) * 12);
      const alpha = 0.18 + Math.sin(time * 1.4 + i) * 0.1;
      ctx.fillStyle = withAlpha(i % 3 === 0 ? palette.accent2 : palette.accent, alpha);
      ctx.beginPath();
      ctx.arc(x, y, 1.4 + (i % 2), 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }
}
