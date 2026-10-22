import { clamp, TAU, withAlpha } from "../core/utils.js";

const QUALITY_MULTIPLIER = { low: 0.38, medium: 0.7, high: 1 };

export class ParticleSystem {
  constructor(quality = "high") {
    this.particles = [];
    this.quality = quality;
    this.maxParticles = 900;
  }

  setQuality(quality) {
    this.quality = quality;
    this.maxParticles = quality === "low" ? 260 : quality === "medium" ? 540 : 900;
  }

  clear() {
    this.particles.length = 0;
  }

  countFor(count) {
    return Math.max(1, Math.round(count * (QUALITY_MULTIPLIER[this.quality] ?? 1)));
  }

  spawn(x, y, count = 1, options = {}) {
    const amount = this.countFor(count);
    const {
      color = "#ffffff",
      color2 = null,
      speed = 1,
      speedMin = 0,
      spread = TAU,
      angle = 0,
      size = 0.035,
      sizeVariance = 0.6,
      life = 0.6,
      lifeVariance = 0.3,
      gravity = 0,
      drag = 0.92,
      additive = false,
      shape = "circle",
      z = 0,
      vz = 0,
      glow = false,
      jitter = 0.15,
      rotation = null
    } = options;

    if (this.particles.length > this.maxParticles) {
      this.particles.splice(0, this.particles.length - this.maxParticles);
    }

    for (let i = 0; i < amount; i += 1) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speedMin + Math.random() * Math.max(0, speed - speedMin);
      const particleLife = life * (1 - lifeVariance / 2 + Math.random() * lifeVariance);
      this.particles.push({
        x: x + (Math.random() - 0.5) * jitter,
        y: y + (Math.random() - 0.5) * jitter,
        z: z + Math.random() * 0.04,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.76,
        vz: vz + (Math.random() - 0.5) * 0.5,
        gravity,
        drag,
        size: size * (1 - sizeVariance / 2 + Math.random() * sizeVariance),
        life: particleLife,
        maxLife: particleLife,
        color,
        color2,
        additive,
        shape,
        glow,
        rotation: rotation ?? Math.random() * TAU,
        vr: (Math.random() - 0.5) * 8,
        wobble: Math.random() * TAU
      });
    }
  }

  explosion(x, y, palette, intensity = 1) {
    const colors = [palette?.danger || "#ff6b35", palette?.gold || "#ffd479", palette?.white || "#fff4da"];
    this.spawn(x, y, 18 * intensity, {
      color: colors[0],
      color2: colors[1],
      speed: 2.8 * intensity,
      size: 0.055,
      life: 0.55,
      gravity: 1.6,
      additive: true,
      shape: "spark",
      glow: true
    });
    this.spawn(x, y, 10 * intensity, {
      color: colors[2],
      speed: 1.5,
      size: 0.09,
      life: 0.34,
      additive: true,
      shape: "circle",
      glow: true
    });
    this.spawn(x, y, 8 * intensity, {
      color: palette?.smoke || "#5b5964",
      speed: 0.8,
      size: 0.13,
      life: 1.1,
      gravity: -0.12,
      drag: 0.95,
      shape: "smoke",
      additive: false
    });
  }

  blockBreak(x, y, palette) {
    this.spawn(x, y, 14, {
      color: palette?.softTop || "#c7a27b",
      color2: palette?.softSide || "#70513b",
      speed: 1.9,
      size: 0.06,
      life: 0.7,
      gravity: 2.4,
      shape: "shard",
      jitter: 0.5
    });
    this.spawn(x, y, 6, {
      color: "#d7d3c9",
      speed: 0.7,
      size: 0.1,
      life: 0.9,
      gravity: -0.1,
      shape: "smoke",
      jitter: 0.35
    });
  }

  enemyDeath(x, y, color, palette) {
    this.spawn(x, y, 14, {
      color,
      color2: palette?.accent || "#ffffff",
      speed: 1.7,
      size: 0.045,
      life: 0.6,
      gravity: 1.2,
      additive: true,
      shape: "spark"
    });
    this.spawn(x, y - 0.13, 5, {
      color: "#f8f0df",
      speed: 0.55,
      size: 0.05,
      life: 0.75,
      gravity: -0.25,
      shape: "smoke"
    });
  }

  pickup(x, y, color) {
    this.spawn(x, y, 12, {
      color,
      speed: 1.25,
      size: 0.035,
      life: 0.7,
      additive: true,
      shape: "spark"
    });
    this.spawn(x, y, 6, {
      color: "#ffffff",
      speed: 0.4,
      size: 0.045,
      life: 0.5,
      additive: true,
      shape: "circle"
    });
  }

  trail(x, y, color, amount = 1) {
    this.spawn(x, y, amount, {
      color,
      speed: 0.24,
      size: 0.025,
      life: 0.48,
      gravity: -0.04,
      additive: true,
      shape: "circle",
      jitter: 0.18
    });
  }

  update(dt) {
    const list = this.particles;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      const drag = Math.pow(p.drag, dt * 60);
      p.vx *= drag;
      p.vy *= drag;
      p.vz -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.wobble += dt * 4;
      p.rotation += p.vr * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz *= -0.22;
        p.vx *= 0.8;
        p.vy *= 0.8;
      }
    }
  }

  draw(ctx, palette) {
    const list = this.particles;
    for (const p of list) {
      const t = clamp(p.life / p.maxLife, 0, 1);
      const alpha = p.shape === "smoke" ? t * 0.34 : Math.min(1, t * 1.6);
      const size = p.size * (p.shape === "smoke" ? 1 + (1 - t) * 1.9 : 0.7 + t * 0.55);
      let color = p.color;
      if (p.color2 && p.shape === "spark") color = t > 0.55 ? p.color2 : p.color;
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = p.additive ? "lighter" : "source-over";
      if (p.glow) {
        ctx.shadowBlur = size * 190;
        ctx.shadowColor = color;
      }
      ctx.fillStyle = color;
      if (p.shape === "spark") {
        ctx.save();
        ctx.translate(p.x, p.y - p.z);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillRect(-size * 2.4, -size * 0.38, size * 4.8, size * 0.76);
        ctx.restore();
      } else if (p.shape === "shard") {
        ctx.save();
        ctx.translate(p.x, p.y - p.z);
        ctx.rotate(p.rotation);
        ctx.beginPath();
        ctx.moveTo(-size, -size * 0.5);
        ctx.lineTo(size * 0.6, -size * 0.8);
        ctx.lineTo(size * 0.9, size * 0.7);
        ctx.lineTo(-size * 0.5, size * 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.shape === "smoke") {
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath();
        ctx.arc(p.x + Math.sin(p.wobble) * 0.03, p.y - p.z, size, 0, TAU);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y - p.z, size, 0, TAU);
        ctx.fill();
        if (p.glow) {
          ctx.globalAlpha = alpha * 0.28;
          ctx.beginPath();
          ctx.arc(p.x, p.y - p.z, size * 2.6, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

export class FloatingTexts {
  constructor() {
    this.items = [];
  }

  clear() {
    this.items.length = 0;
  }

  add(x, y, text, color = "#ffffff", life = 1.0, size = 0.22) {
    this.items.push({ x, y, text, color, life, maxLife: life, size, vy: -0.45 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i];
      item.life -= dt;
      item.y += item.vy * dt;
      item.vy *= 0.96;
      if (item.life <= 0) this.items.splice(i, 1);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const item of this.items) {
      const t = clamp(item.life / item.maxLife, 0, 1);
      const alpha = Math.min(1, t * 2.2);
      ctx.globalAlpha = alpha;
      ctx.font = `800 ${item.size}px "Manrope", "Segoe UI", sans-serif`;
      ctx.lineWidth = 0.035;
      ctx.strokeStyle = "rgba(3,8,14,.72)";
      ctx.strokeText(item.text, item.x, item.y);
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, item.x, item.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

export class AmbientSystem {
  constructor(quality = "high") {
    this.quality = quality;
    this.particles = [];
    this.ready = false;
  }

  setQuality(quality) {
    this.quality = quality;
    this.ready = false;
  }

  init(kind, palette, cols, rows) {
    this.kind = kind;
    this.palette = palette;
    this.cols = cols;
    this.rows = rows;
    this.particles = [];
    const density = this.quality === "low" ? 0.4 : this.quality === "medium" ? 0.7 : 1;
    const count = Math.round((kind === "star" ? 52 : 34) * density);
    for (let i = 0; i < count; i += 1) {
      this.particles.push(this.#makeParticle(true));
    }
    this.ready = true;
  }

  #makeParticle(initial = false) {
    const kind = this.kind;
    const p = {
      x: Math.random() * (this.cols + 2) - 1,
      y: Math.random() * (this.rows + 2) - 1,
      z: Math.random(),
      size: 0.012 + Math.random() * 0.035,
      speed: 0.04 + Math.random() * 0.1,
      phase: Math.random() * TAU,
      drift: (Math.random() - 0.5) * 0.06,
      alpha: 0.18 + Math.random() * 0.5,
      twinkle: 0.5 + Math.random() * 2,
      shape: "dot"
    };
    if (kind === "snow") {
      p.speed = 0.1 + Math.random() * 0.17;
      p.size = 0.012 + Math.random() * 0.024;
      p.shape = "flake";
    } else if (kind === "ember") {
      p.speed = 0.16 + Math.random() * 0.28;
      p.size = 0.01 + Math.random() * 0.02;
      p.shape = "spark";
    } else if (kind === "bubble") {
      p.speed = 0.05 + Math.random() * 0.16;
      p.size = 0.015 + Math.random() * 0.04;
      p.shape = "ring";
    } else if (kind === "star") {
      p.size = 0.008 + Math.random() * 0.02;
      p.speed = 0.01;
      p.shape = "star";
    } else if (kind === "sand") {
      p.speed = 0.23 + Math.random() * 0.3;
      p.size = 0.007 + Math.random() * 0.016;
      p.shape = "streak";
    } else if (kind === "data") {
      p.speed = 0.16 + Math.random() * 0.35;
      p.size = 0.008 + Math.random() * 0.012;
      p.shape = "streak";
    } else if (kind === "spore") {
      p.speed = 0.02 + Math.random() * 0.07;
      p.size = 0.012 + Math.random() * 0.035;
      p.shape = "dot";
    } else if (kind === "sprinkle") {
      p.speed = 0.06 + Math.random() * 0.12;
      p.size = 0.012 + Math.random() * 0.018;
      p.shape = "star";
    } else if (kind === "leaf") {
      p.speed = 0.08 + Math.random() * 0.16;
      p.size = 0.018 + Math.random() * 0.026;
      p.shape = "leaf";
    } else if (kind === "gold") {
      p.speed = 0.02 + Math.random() * 0.09;
      p.size = 0.007 + Math.random() * 0.018;
      p.shape = "star";
    }
    if (initial) p.y = Math.random() * (this.rows + 2) - 1;
    return p;
  }

  update(dt, time, quality = this.quality) {
    if (!this.ready) return;
    for (let i = 0; i < this.particles.length; i += 1) {
      const p = this.particles[i];
      const kind = this.kind;
      p.phase += dt * (0.7 + p.twinkle * 0.35);
      if (kind === "ember" || kind === "snow" || kind === "sand" || kind === "data" || kind === "gold") {
        p.y += p.speed * dt;
        p.x += p.drift * dt + Math.sin(p.phase) * 0.04 * dt;
        if (p.y > this.rows + 1) {
          p.y = -1;
          p.x = Math.random() * (this.cols + 2) - 1;
        }
      } else if (kind === "bubble") {
        p.y -= p.speed * dt;
        p.x += Math.sin(p.phase) * 0.08 * dt;
        if (p.y < -1) {
          p.y = this.rows + 1;
          p.x = Math.random() * (this.cols + 2) - 1;
        }
      } else {
        p.x += Math.sin(p.phase * 0.4) * 0.03 * dt;
        p.y += Math.cos(p.phase * 0.33) * 0.025 * dt;
      }
    }
  }

  draw(ctx, time) {
    if (!this.ready) return;
    const p = this.palette;
    const colors = {
      firefly: p.glow,
      ember: p.danger,
      snow: p.frost,
      bubble: p.accent2,
      star: p.glowSoft,
      sand: p.gold,
      data: p.accent,
      spore: p.accent,
      sprinkle: p.accent2,
      leaf: p.accentSoft,
      gold: p.gold
    };
    const color = colors[this.kind] || p.accent;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const particle of this.particles) {
      const twinkle = 0.5 + Math.sin(particle.phase * 2) * 0.5;
      ctx.globalAlpha = particle.alpha * (0.4 + twinkle * 0.6);
      ctx.fillStyle = color;
      if (particle.shape === "ring") {
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.012;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
        ctx.stroke();
      } else if (particle.shape === "streak") {
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(0.5 + particle.drift * 6);
        ctx.fillRect(-particle.size * 0.4, -particle.size * 1.7, particle.size * 0.8, particle.size * 3.4);
        ctx.restore();
      } else if (particle.shape === "flake") {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
        ctx.fill();
      } else if (particle.shape === "star") {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 0.7, 0, TAU);
        ctx.fill();
        ctx.globalAlpha *= 0.45;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 2.2, 0, TAU);
        ctx.fill();
      } else if (particle.shape === "leaf") {
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.phase);
        ctx.beginPath();
        ctx.ellipse(0, 0, particle.size, particle.size * 0.36, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}
