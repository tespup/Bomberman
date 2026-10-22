import {
  TAU,
  clamp,
  lerp,
  roundedRect,
  fillCircle,
  ellipse,
  withAlpha,
  lighten,
  darken,
  mixColors,
  starPath
} from "../core/utils.js";
import { POWERUPS, MOUNTS } from "./catalog.js";

const HERO_THEMES = [
  {
    suit: "#eaf7ee",
    suitShade: "#b9d8ce",
    accent: "#2fd8b0",
    accentDark: "#0a6b63",
    pants: "#173c49",
    pantsLight: "#275969",
    boot: "#ff925c",
    cap: "#0b776e",
    capDark: "#06443f",
    skin: "#ffd0a5",
    skinShade: "#df9d77",
    hair: "#4a2b22",
    glow: "#7effda"
  },
  {
    suit: "#ffe7ee",
    suitShade: "#e2b6c7",
    accent: "#ff5d8f",
    accentDark: "#8b1f48",
    pants: "#3b203f",
    pantsLight: "#5a315e",
    boot: "#ffcf6a",
    cap: "#8a2356",
    capDark: "#4e102e",
    skin: "#f4c29c",
    skinShade: "#cc8d6f",
    hair: "#251720",
    glow: "#ff9fc0"
  }
];

function outline(ctx, color = "rgba(3, 9, 15, .62)", width = 0.025) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function capsule(ctx, x1, y1, x2, y2, width) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.stroke();
}

function eye(ctx, x, y, r, lookX = 0, lookY = 0, color = "#14232a") {
  ctx.fillStyle = "#f8fbf8";
  fillCircle(ctx, x, y, r);
  ctx.fillStyle = color;
  fillCircle(ctx, x + lookX * r * 0.3, y + lookY * r * 0.25, r * 0.54);
  ctx.fillStyle = "rgba(255,255,255,.9)";
  fillCircle(ctx, x + lookX * r * 0.3 - r * 0.16, y + lookY * r * 0.25 - r * 0.18, r * 0.16);
}

export function drawHero(ctx, player, palette, time, options = {}) {
  const index = player.index || 0;
  const look = HERO_THEMES[index % 2];
  const moving = Boolean(player.moving);
  const speedFactor = clamp(player.speedFactor || 1, 0.8, 1.8);
  const phase = (player.animTime || time) * (moving ? 11 * speedFactor : 2.2);
  const bob = moving ? Math.sin(phase * 2) * 0.015 : Math.sin(time * 2.4) * 0.009;
  const dirX = player.dir?.x || 0;
  const facing = dirX < 0 ? -1 : 1;
  const armor = player.armor || 0;
  const invulnerable = (player.invulnerable || 0) > 0;
  const hurtFlash = Math.max(0, player.hurtFlash || 0);
  const mount = player.mount || null;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.scale(1.08, 1.08);
  ctx.globalAlpha *= player.opacity ?? 1;

  // Soft contact shadow.
  ctx.fillStyle = "rgba(1, 5, 10, .3)";
  ellipse(ctx, 0, 0.39, 0.34, 0.115);
  ctx.fill();

  if (invulnerable) {
    const alpha = 0.2 + Math.sin(time * 11) * 0.1;
    ctx.save();
    ctx.strokeStyle = withAlpha(look.glow, Math.max(0.15, alpha));
    ctx.lineWidth = 0.018;
    ctx.setLineDash([0.11, 0.07]);
    ctx.lineDashOffset = -time * 0.6;
    ctx.beginPath();
    ctx.arc(0, 0.04, 0.48, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  if (player.powers?.has("magnet")) {
    ctx.save();
    ctx.strokeStyle = withAlpha(palette.accent2, 0.22);
    ctx.lineWidth = 0.012;
    for (let i = 0; i < 2; i += 1) {
      const r = 0.47 + i * 0.09 + Math.sin(time * 2 + i) * 0.018;
      ctx.beginPath();
      ctx.arc(0, 0.1, r, time * 0.8 + i, time * 0.8 + i + 1.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (mount) {
    ctx.save();
    ctx.scale(1.1, 1.1);
    drawMount(ctx, mount, palette, time, phase);
    ctx.restore();
    ctx.translate(0, -0.11);
  }

  ctx.translate(0, bob);
  ctx.save();
  ctx.scale(facing, 1);

  // Backpack.
  ctx.fillStyle = look.capDark;
  roundedRect(ctx, -0.3, -0.13, 0.16, 0.31, 0.07);
  ctx.fill();
  outline(ctx, "rgba(3,9,15,.45)", 0.018);
  ctx.fillStyle = look.boot;
  roundedRect(ctx, -0.285, 0.03, 0.075, 0.12, 0.03);
  ctx.fill();
  ctx.fillStyle = withAlpha("#ffffff", 0.18);
  roundedRect(ctx, -0.27, 0.055, 0.045, 0.05, 0.018);
  ctx.fill();

  // Legs and boots.
  const legSwing = moving ? Math.sin(phase) * 0.07 : 0;
  ctx.lineCap = "round";
  ctx.strokeStyle = look.pants;
  ctx.lineWidth = 0.1;
  capsule(ctx, -0.115, 0.15 + legSwing * 0.2, -0.13, 0.31 + legSwing, 0.1);
  capsule(ctx, 0.115, 0.15 - legSwing * 0.2, 0.13, 0.31 - legSwing, 0.1);
  ctx.strokeStyle = look.pantsLight;
  ctx.lineWidth = 0.035;
  capsule(ctx, -0.09, 0.18 + legSwing * 0.15, -0.1, 0.28 + legSwing, 0.03);
  capsule(ctx, 0.14, 0.18 - legSwing * 0.15, 0.15, 0.28 - legSwing, 0.03);

  // Boots.
  for (const [side, swing] of [[-1, legSwing], [1, -legSwing]]) {
    ctx.save();
    ctx.translate(side * 0.13, 0.34 + swing * 0.9);
    ctx.fillStyle = look.boot;
    roundedRect(ctx, -0.085, -0.045, 0.17, 0.085, 0.04);
    ctx.fill();
    outline(ctx, "rgba(3,9,15,.48)", 0.016);
    ctx.fillStyle = withAlpha("#ffffff", 0.22);
    roundedRect(ctx, -0.05, -0.03, 0.07, 0.022, 0.012);
    ctx.fill();
    ctx.restore();
  }

  // Body / bomber jacket.
  const bodyGradient = ctx.createLinearGradient(-0.23, -0.08, 0.3, 0.28);
  bodyGradient.addColorStop(0, look.suit);
  bodyGradient.addColorStop(0.55, look.suit);
  bodyGradient.addColorStop(1, look.suitShade);
  ctx.fillStyle = bodyGradient;
  ctx.beginPath();
  ctx.moveTo(-0.17, -0.095);
  ctx.quadraticCurveTo(-0.31, -0.01, -0.27, 0.16);
  ctx.quadraticCurveTo(-0.24, 0.285, 0, 0.29);
  ctx.quadraticCurveTo(0.24, 0.285, 0.28, 0.14);
  ctx.quadraticCurveTo(0.31, -0.01, 0.17, -0.095);
  ctx.quadraticCurveTo(0, -0.15, -0.17, -0.095);
  ctx.closePath();
  ctx.fill();
  outline(ctx, "rgba(5,13,20,.5)", 0.02);

  // Jacket zip and panels.
  ctx.strokeStyle = withAlpha(look.accent, 0.7);
  ctx.lineWidth = 0.017;
  ctx.beginPath();
  ctx.moveTo(0, -0.07);
  ctx.lineTo(0, 0.26);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(look.accentDark, 0.35);
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.moveTo(-0.24, 0.04);
  ctx.quadraticCurveTo(-0.09, 0.02, -0.02, 0.09);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.24, 0.04);
  ctx.quadraticCurveTo(0.09, 0.02, 0.02, 0.09);
  ctx.stroke();

  // Belt.
  ctx.fillStyle = look.pants;
  roundedRect(ctx, -0.225, 0.19, 0.45, 0.065, 0.025);
  ctx.fill();
  ctx.fillStyle = look.boot;
  roundedRect(ctx, -0.045, 0.19, 0.09, 0.06, 0.018);
  ctx.fill();
  ctx.fillStyle = withAlpha("#ffffff", 0.35);
  fillCircle(ctx, 0, 0.216, 0.012);

  // Arms with gloves.
  const armSwing = moving ? Math.sin(phase + Math.PI) * 0.045 : Math.sin(time * 2.2) * 0.012;
  ctx.strokeStyle = look.suitShade;
  ctx.lineWidth = 0.085;
  capsule(ctx, -0.245, 0.015, -0.31, 0.125 + armSwing, 0.085);
  capsule(ctx, 0.245, 0.015, 0.31, 0.125 - armSwing, 0.085);
  ctx.fillStyle = look.accent;
  fillCircle(ctx, -0.315, 0.14 + armSwing, 0.055);
  fillCircle(ctx, 0.315, 0.14 - armSwing, 0.055);
  outline(ctx, "rgba(4,12,18,.42)", 0.016);

  // Armor layers.
  if (armor > 0) {
    ctx.save();
    const metal = ctx.createLinearGradient(-0.2, -0.05, 0.25, 0.24);
    metal.addColorStop(0, "#f0f8ff");
    metal.addColorStop(0.38, "#aac8d7");
    metal.addColorStop(0.64, "#e7f4f8");
    metal.addColorStop(1, "#6c8b9b");
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.moveTo(-0.19, -0.045);
    ctx.quadraticCurveTo(0, -0.11, 0.19, -0.045);
    ctx.lineTo(0.205, 0.15);
    ctx.quadraticCurveTo(0.12, 0.22, 0, 0.225);
    ctx.quadraticCurveTo(-0.12, 0.22, -0.205, 0.15);
    ctx.closePath();
    ctx.fill();
    outline(ctx, "rgba(6,18,26,.55)", 0.018);
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(-0.12, 0.02);
    ctx.lineTo(0, 0.08);
    ctx.lineTo(0.12, 0.02);
    ctx.stroke();
    ctx.fillStyle = withAlpha(look.glow, 0.55);
    fillCircle(ctx, 0, 0.145, 0.028);
    // Shoulder pads.
    ctx.fillStyle = "#c2dae5";
    roundedRect(ctx, -0.33, -0.035, 0.13, 0.1, 0.045);
    ctx.fill();
    ctx.strokeStyle = "rgba(5,16,24,.4)";
    ctx.stroke();
    roundedRect(ctx, 0.2, -0.035, 0.13, 0.1, 0.045);
    ctx.fill();
    ctx.stroke();
    if (armor > 1) {
      ctx.fillStyle = "rgba(255,255,255,.3)";
      fillCircle(ctx, 0.25, 0.012, 0.018);
    }
    ctx.restore();
  }

  // Neck.
  ctx.fillStyle = look.skinShade;
  roundedRect(ctx, -0.055, -0.135, 0.11, 0.08, 0.025);
  ctx.fill();

  // Head group (large, friendly proportions).
  ctx.save();
  ctx.translate(0.005, -0.265);
  const headBob = moving ? Math.sin(phase * 2) * 0.004 : 0;
  ctx.translate(0, headBob);

  // Hair tuft behind the cap.
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.arc(-0.135, -0.02, 0.075, Math.PI * 0.7, Math.PI * 1.55);
  ctx.fill();

  // Face.
  const skinGradient = ctx.createLinearGradient(-0.14, -0.20, 0.15, 0.18);
  skinGradient.addColorStop(0, lighten(look.skin, 0.16));
  skinGradient.addColorStop(0.6, look.skin);
  skinGradient.addColorStop(1, look.skinShade);
  ctx.fillStyle = skinGradient;
  ctx.beginPath();
  ctx.ellipse(0, 0.015, 0.172, 0.182, 0, 0, TAU);
  ctx.fill();
  outline(ctx, "rgba(5,12,18,.45)", 0.017);

  // Ears.
  ctx.fillStyle = look.skinShade;
  fillCircle(ctx, -0.165, 0.04, 0.043);
  fillCircle(ctx, 0.165, 0.04, 0.043);

  // Hair fringe.
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.moveTo(-0.17, -0.07);
  ctx.quadraticCurveTo(-0.12, -0.205, 0.04, -0.2);
  ctx.quadraticCurveTo(0.17, -0.2, 0.185, -0.065);
  ctx.quadraticCurveTo(0.11, -0.115, 0.075, -0.085);
  ctx.quadraticCurveTo(0.045, -0.125, -0.01, -0.085);
  ctx.quadraticCurveTo(-0.07, -0.13, -0.17, -0.07);
  ctx.fill();

  // Bomber cap.
  ctx.fillStyle = look.cap;
  ctx.beginPath();
  ctx.ellipse(0.005, -0.125, 0.19, 0.105, -0.04, Math.PI, TAU);
  ctx.lineTo(0.2, -0.075);
  ctx.quadraticCurveTo(0.0, -0.02, -0.195, -0.09);
  ctx.closePath();
  ctx.fill();
  outline(ctx, "rgba(4,11,17,.5)", 0.017);
  ctx.fillStyle = look.capDark;
  roundedRect(ctx, -0.205, -0.105, 0.415, 0.04, 0.02);
  ctx.fill();
  ctx.fillStyle = look.boot;
  roundedRect(ctx, -0.07, -0.225, 0.145, 0.035, 0.016);
  ctx.fill();
  ctx.fillStyle = look.accent;
  fillCircle(ctx, 0.135, -0.115, 0.023);
  ctx.fillStyle = withAlpha(look.glow, 0.9);
  fillCircle(ctx, 0.135, -0.115, 0.012);

  // Goggles on the forehead.
  ctx.strokeStyle = "#1a2730";
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(-0.17, -0.12);
  ctx.lineTo(0.17, -0.12);
  ctx.stroke();
  ctx.fillStyle = "rgba(139,235,255,.42)";
  roundedRect(ctx, -0.135, -0.16, 0.11, 0.075, 0.03);
  ctx.fill();
  roundedRect(ctx, 0.022, -0.16, 0.11, 0.075, 0.03);
  ctx.fill();
  ctx.strokeStyle = withAlpha("#ecfeff", 0.65);
  ctx.lineWidth = 0.012;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.48)";
  fillCircle(ctx, -0.1, -0.136, 0.018);
  fillCircle(ctx, 0.055, -0.136, 0.018);

  // Eyes.
  const lookDir = player.dir || { x: 1, y: 0 };
  eye(ctx, -0.07, 0.045, 0.043, lookDir.x, lookDir.y);
  eye(ctx, 0.07, 0.045, 0.043, lookDir.x, lookDir.y);
  // Brows give personality.
  ctx.strokeStyle = look.hair;
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  ctx.moveTo(-0.107, 0.0);
  ctx.quadraticCurveTo(-0.075, -0.008, -0.042, 0.002);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.042, 0.002);
  ctx.quadraticCurveTo(0.075, -0.008, 0.107, 0.0);
  ctx.stroke();
  // Nose & mouth.
  ctx.strokeStyle = withAlpha(look.skinShade, 0.8);
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.arc(0.005, 0.098, 0.048, 0.22, Math.PI - 0.22);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,160,150,.32)";
  fillCircle(ctx, -0.12, 0.105, 0.028);
  fillCircle(ctx, 0.12, 0.105, 0.028);

  // Antenna.
  ctx.strokeStyle = look.capDark;
  ctx.lineWidth = 0.013;
  ctx.beginPath();
  ctx.moveTo(0.08, -0.205);
  ctx.quadraticCurveTo(0.145, -0.29, 0.13, -0.33);
  ctx.stroke();
  const antennaGlow = 0.5 + Math.sin(time * 5) * 0.35;
  ctx.fillStyle = withAlpha(look.glow, antennaGlow);
  fillCircle(ctx, 0.13, -0.335, 0.022);
  ctx.restore();

  // P2 scarf tail.
  if (index === 1) {
    ctx.fillStyle = look.accent;
    ctx.beginPath();
    ctx.moveTo(-0.22, -0.04);
    ctx.quadraticCurveTo(-0.39, 0.03 + Math.sin(time * 4) * 0.02, -0.37, 0.13);
    ctx.quadraticCurveTo(-0.29, 0.08, -0.2, 0.02);
    ctx.fill();
    outline(ctx, "rgba(5,12,18,.28)", 0.012);
  }

  // A small shine on the helmet.
  ctx.fillStyle = "rgba(255,255,255,.24)";
  ctx.beginPath();
  ctx.ellipse(-0.08, -0.16, 0.055, 0.02, -0.5, 0, TAU);
  ctx.fill();

  ctx.restore();

  if (hurtFlash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha *= clamp(hurtFlash, 0, 1) * 0.6;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, 0.38, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // "P2" ribbon.
  if (options.showTag) {
    ctx.save();
    ctx.globalAlpha *= 0.9;
    ctx.font = '800 .12px "Manrope", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = index === 0 ? "#61f7c8" : "#ff7aa7";
    ctx.strokeStyle = "rgba(3,8,14,.7)";
    ctx.lineWidth = 0.025;
    ctx.strokeText(index === 0 ? "P1" : "P2", 0, -0.62);
    ctx.fillText(index === 0 ? "P1" : "P2", 0, -0.62);
    ctx.restore();
  }

  ctx.restore();
}

export function drawMount(ctx, mount, palette, time, phase) {
  const def = MOUNTS[mount.key] || MOUNTS.roo;
  const bob = Math.sin(time * 4.5) * 0.012;
  ctx.save();
  ctx.translate(0, 0.17 + bob);
  ctx.fillStyle = "rgba(1,6,10,.25)";
  ellipse(ctx, 0, 0.27, 0.36, 0.1);
  ctx.fill();

  if (mount.key === "roo") {
    ctx.fillStyle = def.accent;
    roundedRect(ctx, -0.24, 0.0, 0.48, 0.24, 0.11);
    ctx.fill();
    ctx.strokeStyle = "rgba(23,14,9,.5)";
    ctx.lineWidth = 0.018;
    ctx.stroke();
    // Tail.
    ctx.strokeStyle = def.accent;
    ctx.lineWidth = 0.09;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-0.22, 0.12);
    ctx.quadraticCurveTo(-0.4, 0.15, -0.37, 0.0);
    ctx.stroke();
    // Feet.
    ctx.fillStyle = def.accent;
    ellipse(ctx, -0.19, 0.27, 0.14, 0.055);
    ctx.fill();
    ellipse(ctx, 0.19, 0.27, 0.14, 0.055);
    ctx.fill();
    // Head.
    ctx.fillStyle = def.color;
    ellipse(ctx, 0.31, -0.02, 0.135, 0.115);
    ctx.fill();
    outline(ctx, "rgba(30,17,9,.45)", 0.015);
    // Ears.
    ctx.fillStyle = def.color;
    ellipse(ctx, 0.265, -0.16, 0.035, 0.09, -0.2);
    ctx.fill();
    ellipse(ctx, 0.36, -0.16, 0.035, 0.09, 0.2);
    ctx.fill();
    // Face.
    eye(ctx, 0.335, -0.025, 0.028, 1, 0);
    ctx.fillStyle = "#202026";
    fillCircle(ctx, 0.405, 0.025, 0.02);
    // Saddle.
    ctx.fillStyle = "#713c2f";
    roundedRect(ctx, -0.15, -0.025, 0.27, 0.07, 0.025);
    ctx.fill();
    ctx.strokeStyle = "#ffcc89";
    ctx.lineWidth = 0.012;
    ctx.stroke();
  } else if (mount.key === "drake") {
    ctx.fillStyle = def.accent;
    ellipse(ctx, -0.26, -0.02, 0.16, 0.105, -0.25);
    ctx.fill();
    ellipse(ctx, 0.26, -0.02, 0.16, 0.105, 0.25);
    ctx.fill();
    ctx.strokeStyle = "rgba(60,18,28,.4)";
    ctx.lineWidth = 0.012;
    ctx.stroke();
    ctx.fillStyle = darken(def.color, 0.28);
    roundedRect(ctx, -0.25, 0.03, 0.5, 0.22, 0.1);
    ctx.fill();
    // Belly scales.
    ctx.fillStyle = "#ffd0ae";
    roundedRect(ctx, -0.14, 0.11, 0.28, 0.11, 0.055);
    ctx.fill();
    // Head and horns.
    ctx.strokeStyle = darken(def.color, 0.2);
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(0.22, -0.02);
    ctx.quadraticCurveTo(0.3, -0.1, 0.35, -0.06);
    ctx.stroke();
    ctx.fillStyle = def.color;
    ellipse(ctx, 0.37, -0.07, 0.14, 0.11);
    ctx.fill();
    outline(ctx, "rgba(57,16,28,.45)", 0.014);
    ctx.fillStyle = "#ffe8b4";
    ctx.beginPath();
    ctx.moveTo(0.34, -0.16);
    ctx.lineTo(0.41, -0.26);
    ctx.lineTo(0.43, -0.14);
    ctx.fill();
    eye(ctx, 0.41, -0.075, 0.026, 1, 0);
    ctx.fillStyle = "#ff7b7b";
    fillCircle(ctx, 0.475, -0.025, 0.015);
    // Small wing.
    ctx.fillStyle = withAlpha("#ffb7d0", 0.55);
    ctx.beginPath();
    ctx.moveTo(-0.08, 0.02);
    ctx.quadraticCurveTo(-0.23, -0.14, -0.34, 0.0);
    ctx.quadraticCurveTo(-0.23, 0.0, -0.13, 0.05);
    ctx.fill();
    ctx.strokeStyle = withAlpha("#ffd1e2", 0.6);
    ctx.lineWidth = 0.012;
    ctx.stroke();
    // Feet.
    ctx.fillStyle = def.accent;
    for (const side of [-1, 1]) {
      roundedRect(ctx, side * 0.2 - 0.04, 0.235, 0.08, 0.06, 0.02);
      ctx.fill();
    }
  } else {
    // Luminous beetle.
    ctx.fillStyle = def.accent;
    ellipse(ctx, 0, 0.11, 0.3, 0.18);
    ctx.fill();
    ctx.fillStyle = def.color;
    ellipse(ctx, 0, 0.07, 0.27, 0.16);
    ctx.fill();
    ctx.strokeStyle = "rgba(4,48,42,.45)";
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(0, -0.07);
    ctx.lineTo(0, 0.23);
    ctx.stroke();
    // Wings.
    ctx.fillStyle = withAlpha("#cafff1", 0.5);
    ellipse(ctx, -0.25, 0.04, 0.18, 0.08, -0.5);
    ctx.fill();
    ellipse(ctx, 0.25, 0.04, 0.18, 0.08, 0.5);
    ctx.fill();
    // Glow spots.
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = withAlpha("#d8fff5", 0.8);
    for (const [x, y] of [[-0.11, 0.07], [0.11, 0.07], [0, 0.16]]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.038 + Math.sin(time * 4 + x * 9) * 0.008, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    // Head.
    ctx.fillStyle = "#173b38";
    ellipse(ctx, 0.34, 0.01, 0.095, 0.082);
    ctx.fill();
    eye(ctx, 0.38, 0.0, 0.022, 1, 0);
    // Legs.
    ctx.strokeStyle = "#174e48";
    ctx.lineWidth = 0.025;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i += 1) {
        ctx.beginPath();
        ctx.moveTo(side * (0.12 + i * 0.06), 0.19);
        ctx.lineTo(side * (0.18 + i * 0.05), 0.25);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

export function drawEnemy(ctx, enemy, palette, time, options = {}) {
  if (!enemy.alive && enemy.dying <= 0) return;
  if (enemy.type === "burrower" && !enemy.surfaced) {
    drawBurrowMound(ctx, enemy, palette, time);
    return;
  }
  const def = enemy.def;
  const baseColor = mixColors(def.color, palette.accent, 0.22);
  const dark = darken(baseColor, 0.38);
  const light = lighten(baseColor, 0.28);
  const alert = enemy.attackState === "strike" || enemy.attackState === "wait";
  const wobble = Math.sin(enemy.anim * 5.2 + enemy.phase) * 0.025;
  const squash = enemy.type === "hopper" ? 1 - Math.min(0.18, enemy.z * 0.24) : 1;

  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  if (!enemy.alive) {
    ctx.globalAlpha *= Math.max(0, enemy.dying / 0.5);
    ctx.translate(0, (0.5 - enemy.dying) * 0.18);
  }
  ctx.globalAlpha *= enemy.opacity;
  ctx.fillStyle = "rgba(1,5,10,.28)";
  ellipse(ctx, 0, 0.39, 0.31 * enemy.size, 0.09);
  ctx.fill();

  ctx.translate(0, -enemy.z);
  ctx.scale((enemy.dir?.x || 0) < 0 ? -1 : 1, squash);
  ctx.scale(enemy.size, enemy.size);
  ctx.rotate(wobble * 0.4);

  if (enemy.hitFlash > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha *= Math.min(0.65, enemy.hitFlash * 0.8);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, 0.37, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  if (enemy.attackState === "strike" && enemy.type === "trickster") {
    ctx.save();
    ctx.globalAlpha *= 0.16;
    ctx.fillStyle = def.color;
    for (const offset of [-0.23, 0.2]) {
      ellipse(ctx, offset, 0.03, 0.18, 0.25);
      ctx.fill();
    }
    ctx.restore();
  }

  if (enemy.type === "crawler" || enemy.type === "mini") {
    drawSlime(ctx, enemy, baseColor, dark, light, time);
  } else if (enemy.type === "runner") {
    drawRunner(ctx, enemy, baseColor, dark, light, time);
  } else if (enemy.type === "hunter") {
    drawHunter(ctx, enemy, baseColor, dark, light, time, alert);
  } else if (enemy.type === "golem") {
    drawGolem(ctx, enemy, baseColor, dark, light, time);
  } else if (enemy.type === "hopper") {
    drawHopper(ctx, enemy, baseColor, dark, light, time);
  } else if (enemy.type === "firetail") {
    drawFiretail(ctx, enemy, baseColor, dark, light, time, palette);
  } else if (enemy.type === "coward") {
    drawCoward(ctx, enemy, baseColor, dark, light, time);
  } else if (enemy.type === "phantom") {
    drawPhantom(ctx, enemy, baseColor, dark, light, time);
  } else if (enemy.type === "trickster") {
    drawTrickster(ctx, enemy, baseColor, dark, light, time);
  } else if (enemy.type === "splitter") {
    drawSplitter(ctx, enemy, baseColor, dark, light, time);
  } else if (enemy.type === "turret") {
    drawTurret(ctx, enemy, baseColor, dark, light, time, palette);
  } else {
    drawSlime(ctx, enemy, baseColor, dark, light, time);
  }

  drawEnemyVariantMarks(ctx, enemy, palette, time, light);

  if (enemy.health < enemy.maxHealth && enemy.alive) {
    drawHealthPips(ctx, enemy, 0.46);
  }
  ctx.restore();
}

function drawEnemyVariantMarks(ctx, enemy, palette, time, light) {
  const variant = ((enemy.variant ?? 0) + (enemy.seed % 4)) % 4;
  const accent = palette.accent;
  ctx.save();
  if (variant === 1) {
    // A floating hunter sigil marks the veteran variant.
    ctx.globalAlpha *= 0.7;
    ctx.strokeStyle = withAlpha(accent, 0.7);
    ctx.lineWidth = 0.011;
    ctx.translate(0, -0.5 + Math.sin(time * 2.3 + enemy.phase) * 0.02);
    ctx.rotate(time * 0.5);
    ctx.beginPath();
    ctx.moveTo(0, -0.05);
    ctx.lineTo(0.045, 0);
    ctx.lineTo(0, 0.05);
    ctx.lineTo(-0.045, 0);
    ctx.closePath();
    ctx.stroke();
  } else if (variant === 2) {
    // Side spurs make the silhouette read differently even at a glance.
    ctx.globalAlpha *= 0.55;
    ctx.strokeStyle = withAlpha(light, 0.8);
    ctx.lineWidth = 0.018;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 0.26, -0.02);
      ctx.lineTo(side * 0.36, -0.1);
      ctx.lineTo(side * 0.31, 0.04);
      ctx.stroke();
    }
  } else if (variant === 3) {
    // A slow ground halo for the most dangerous variant.
    ctx.globalAlpha *= 0.35 + Math.sin(time * 2 + enemy.phase) * 0.1;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.ellipse(0, 0.31, 0.3, 0.1, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = withAlpha(accent, 0.7);
    fillCircle(ctx, 0.24, 0.28, 0.015);
    fillCircle(ctx, -0.22, 0.3, 0.012);
  }
  ctx.restore();
}

function drawSlime(ctx, enemy, color, dark, light, time) {
  const t = enemy.anim * 3.6 + enemy.phase;
  const width = 0.31 + Math.sin(t) * 0.015;
  const height = 0.25 + Math.cos(t * 0.8) * 0.013;
  ctx.fillStyle = dark;
  ellipse(ctx, 0, 0.17, width * 1.2, 0.11);
  ctx.fill();
  const gradient = ctx.createRadialGradient(-0.1, -0.08, 0.02, 0, 0.05, 0.36);
  gradient.addColorStop(0, light);
  gradient.addColorStop(0.52, color);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(-width, 0.16);
  ctx.bezierCurveTo(-width - 0.02, -0.08, -0.16, -height - 0.07, 0, -height - 0.07);
  ctx.bezierCurveTo(0.16, -height - 0.07, width + 0.02, -0.08, width, 0.16);
  ctx.quadraticCurveTo(0, 0.245, -width, 0.16);
  ctx.closePath();
  ctx.fill();
  outline(ctx, "rgba(4,12,18,.4)", 0.018);
  // Highlight.
  ctx.fillStyle = withAlpha("#ffffff", 0.24);
  ellipse(ctx, -0.1, -0.1, 0.075, 0.035, -0.5);
  ctx.fill();
  // Spots.
  ctx.fillStyle = withAlpha(dark, 0.35);
  fillCircle(ctx, 0.14, 0.03, 0.04);
  fillCircle(ctx, -0.17, 0.07, 0.023);
  fillCircle(ctx, 0.02, 0.12, 0.018);
  eye(ctx, -0.075, -0.02, 0.045, 1, 0);
  eye(ctx, 0.075, -0.02, 0.045, 1, 0);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.013;
  ctx.beginPath();
  ctx.arc(0, 0.055, 0.038, 0.22, Math.PI - 0.22);
  ctx.stroke();
}

function drawRunner(ctx, enemy, color, dark, light, time) {
  const t = enemy.anim * 13 + enemy.phase;
  const bob = Math.abs(Math.sin(t)) * 0.035;
  ctx.translate(0, -bob);
  // Scarf.
  ctx.fillStyle = withAlpha(color, 0.55);
  ctx.beginPath();
  ctx.moveTo(-0.11, -0.03);
  ctx.quadraticCurveTo(-0.39, -0.06 + Math.sin(t) * 0.05, -0.4, 0.08);
  ctx.quadraticCurveTo(-0.27, 0.05, -0.15, 0.08);
  ctx.fill();
  // Legs.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.05;
  for (const side of [-1, 1]) {
    const swing = Math.sin(t + (side > 0 ? Math.PI : 0)) * 0.06;
    ctx.beginPath();
    ctx.moveTo(side * 0.08, 0.14);
    ctx.lineTo(side * 0.1 + swing, 0.3);
    ctx.stroke();
    ctx.fillStyle = light;
    ellipse(ctx, side * 0.1 + swing, 0.32, 0.045, 0.026);
    ctx.fill();
  }
  // Body.
  const gradient = ctx.createLinearGradient(-0.2, -0.15, 0.2, 0.2);
  gradient.addColorStop(0, light);
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  roundedRect(ctx, -0.18, -0.17, 0.36, 0.34, 0.14);
  ctx.fill();
  outline(ctx, "rgba(5,12,18,.42)", 0.017);
  // Belly.
  ctx.fillStyle = withAlpha(light, 0.44);
  ellipse(ctx, 0, 0.03, 0.11, 0.13);
  ctx.fill();
  // Horns.
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.moveTo(-0.105, -0.14);
  ctx.lineTo(-0.155, -0.28);
  ctx.lineTo(-0.035, -0.18);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0.105, -0.14);
  ctx.lineTo(0.155, -0.28);
  ctx.lineTo(0.035, -0.18);
  ctx.fill();
  eye(ctx, -0.065, -0.045, 0.04, 1, 0);
  eye(ctx, 0.065, -0.045, 0.04, 1, 0, "#4c1f16");
  // Grin.
  ctx.strokeStyle = "#2b1520";
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  ctx.arc(0, 0.035, 0.05, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fillRect(-0.025, 0.055, 0.014, 0.018);
  ctx.fillRect(0.012, 0.055, 0.014, 0.018);
}

function drawHunter(ctx, enemy, color, dark, light, time, alert) {
  const hover = Math.sin(enemy.anim * 2.3 + enemy.phase) * 0.03 + 0.05;
  ctx.translate(0, -hover);
  // Tentacles.
  ctx.strokeStyle = withAlpha(dark, 0.8);
  ctx.lineWidth = 0.045;
  ctx.lineCap = "round";
  for (let i = 0; i < 4; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const y = 0.13 + Math.floor(i / 2) * 0.07;
    ctx.beginPath();
    ctx.moveTo(side * (0.13 + Math.floor(i / 2) * 0.02), y);
    ctx.quadraticCurveTo(side * (0.27 + Math.sin(time * 3 + i) * 0.03), y + 0.1, side * 0.2, y + 0.2);
    ctx.stroke();
  }
  // Cloak body.
  const gradient = ctx.createLinearGradient(0, -0.28, 0, 0.24);
  gradient.addColorStop(0, light);
  gradient.addColorStop(0.4, color);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(-0.21, 0.24);
  ctx.quadraticCurveTo(-0.27, 0.0, -0.18, -0.19);
  ctx.quadraticCurveTo(0, -0.32, 0.18, -0.19);
  ctx.quadraticCurveTo(0.27, 0.0, 0.21, 0.24);
  ctx.quadraticCurveTo(0, 0.3, -0.21, 0.24);
  ctx.fill();
  outline(ctx, "rgba(5,12,18,.45)", 0.018);
  // Hood.
  ctx.fillStyle = darken(color, 0.2);
  ctx.beginPath();
  ctx.ellipse(0, -0.14, 0.17, 0.135, 0, Math.PI, TAU);
  ctx.fill();
  // Single eye.
  ctx.fillStyle = "#0b1118";
  fillCircle(ctx, 0, -0.055, 0.085);
  ctx.fillStyle = alert ? "#ffcf5e" : "#f5e5c0";
  fillCircle(ctx, 0, -0.055, 0.063);
  ctx.fillStyle = "#1b1a23";
  const pupil = Math.sin(time * 2.2) * 0.014;
  fillCircle(ctx, pupil, -0.055, 0.025);
  ctx.fillStyle = withAlpha("#fff6c9", 0.9);
  fillCircle(ctx, pupil - 0.015, -0.07, 0.011);
  // Eye ring.
  ctx.strokeStyle = withAlpha(color, 0.8);
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.arc(0, -0.055, 0.095, 0, TAU);
  ctx.stroke();
  // Belt / clasp.
  ctx.fillStyle = "#d4b36a";
  fillCircle(ctx, 0, 0.115, 0.023);
}

function drawGolem(ctx, enemy, color, dark, light, time) {
  const stone = mixColors(color, "#8b8175", 0.35);
  const stoneLight = lighten(stone, 0.3);
  const cracks = withAlpha("#ff8d59", 0.72);
  // Arms.
  ctx.fillStyle = dark;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 0.27, 0.02);
    ctx.rotate(side * -0.16);
    roundedRect(ctx, -0.08, -0.05, 0.14, 0.27, 0.06);
    ctx.fill();
    ctx.strokeStyle = "rgba(3,8,13,.4)";
    ctx.lineWidth = 0.015;
    ctx.stroke();
    ctx.fillStyle = stoneLight;
    fillCircle(ctx, side * 0.02, 0.2, 0.06);
    ctx.restore();
  }
  // Feet.
  ctx.fillStyle = dark;
  roundedRect(ctx, -0.22, 0.26, 0.17, 0.09, 0.03);
  ctx.fill();
  roundedRect(ctx, 0.05, 0.26, 0.17, 0.09, 0.03);
  ctx.fill();
  // Body.
  const gradient = ctx.createLinearGradient(-0.2, -0.3, 0.25, 0.3);
  gradient.addColorStop(0, stoneLight);
  gradient.addColorStop(0.45, stone);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(-0.24, -0.2);
  ctx.quadraticCurveTo(-0.3, 0.12, -0.2, 0.3);
  ctx.quadraticCurveTo(0, 0.36, 0.2, 0.3);
  ctx.quadraticCurveTo(0.3, 0.12, 0.24, -0.2);
  ctx.quadraticCurveTo(0, -0.3, -0.24, -0.2);
  ctx.fill();
  outline(ctx, "rgba(4,10,15,.48)", 0.02);
  // Stone plates.
  ctx.fillStyle = withAlpha(stoneLight, 0.35);
  for (let i = 0; i < 3; i += 1) {
    const y = -0.14 + i * 0.12;
    ctx.beginPath();
    ctx.moveTo(-0.16, y);
    ctx.lineTo(0.16, y + 0.01);
    ctx.lineTo(0.12, y + 0.07);
    ctx.lineTo(-0.12, y + 0.07);
    ctx.fill();
  }
  // Cracks.
  ctx.strokeStyle = cracks;
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  ctx.moveTo(-0.11, -0.19);
  ctx.lineTo(-0.03, -0.08);
  ctx.lineTo(-0.09, 0.0);
  ctx.lineTo(0.01, 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.13, -0.02);
  ctx.lineTo(0.05, 0.06);
  ctx.lineTo(0.12, 0.15);
  ctx.stroke();
  // Head.
  ctx.fillStyle = stone;
  roundedRect(ctx, -0.13, -0.37, 0.26, 0.18, 0.055);
  ctx.fill();
  outline(ctx, "rgba(4,10,15,.45)", 0.015);
  ctx.fillStyle = "#ff9c63";
  fillCircle(ctx, -0.055, -0.29, 0.025);
  fillCircle(ctx, 0.055, -0.29, 0.025);
  ctx.fillStyle = "rgba(255,200,140,.35)";
  fillCircle(ctx, -0.06, -0.3, 0.01);
  // Armor plate count indication.
  ctx.strokeStyle = withAlpha("#ffe0a5", 0.5);
  ctx.lineWidth = 0.01;
  for (let i = 0; i < enemy.health; i += 1) {
    ctx.beginPath();
    ctx.arc((i - (enemy.health - 1) / 2) * 0.075, 0.18, 0.022, 0, TAU);
    ctx.stroke();
  }
}

function drawHopper(ctx, enemy, color, dark, light, time) {
  const crouch = enemy.leap ? 0.88 : 1;
  ctx.scale(1, crouch);
  // Feet.
  ctx.fillStyle = dark;
  ellipse(ctx, -0.2, 0.25, 0.13, 0.06);
  ctx.fill();
  ellipse(ctx, 0.2, 0.25, 0.13, 0.06);
  ctx.fill();
  ctx.fillStyle = light;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.23, 0.2);
    ctx.lineTo(side * 0.32, 0.27);
    ctx.lineTo(side * 0.16, 0.27);
    ctx.fill();
  }
  // Body.
  const gradient = ctx.createRadialGradient(-0.08, -0.12, 0.02, 0, 0.02, 0.34);
  gradient.addColorStop(0, light);
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ellipse(ctx, 0, 0.02, 0.24, 0.23);
  ctx.fill();
  outline(ctx, "rgba(4,12,18,.42)", 0.018);
  // Belly.
  ctx.fillStyle = withAlpha("#fbeac2", 0.45);
  ellipse(ctx, 0, 0.1, 0.14, 0.11);
  ctx.fill();
  // Eye bumps.
  ctx.fillStyle = color;
  fillCircle(ctx, -0.1, -0.17, 0.083);
  fillCircle(ctx, 0.1, -0.17, 0.083);
  eye(ctx, -0.1, -0.18, 0.045, 0, 0);
  eye(ctx, 0.1, -0.18, 0.045, 0, 0);
  // Mouth.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  ctx.arc(0, 0.08, 0.07, 0.15, Math.PI - 0.15);
  ctx.stroke();
  // Back spots.
  ctx.fillStyle = withAlpha(dark, 0.35);
  fillCircle(ctx, -0.15, 0.02, 0.022);
  fillCircle(ctx, 0.16, -0.02, 0.016);
}

function drawFiretail(ctx, enemy, color, dark, light, time, palette) {
  const t = enemy.anim * 3;
  // Flame tail.
  ctx.save();
  ctx.translate(-0.22, 0.06);
  for (let i = 0; i < 3; i += 1) {
    const flicker = Math.sin(t * 3 + i) * 0.03;
    ctx.fillStyle = i === 1 ? "#ffd35e" : "#ff6e3d";
    ctx.globalAlpha = 0.9 - i * 0.18;
    ctx.beginPath();
    ctx.moveTo(-0.11 - i * 0.055, 0.06);
    ctx.quadraticCurveTo(-0.27 - i * 0.05 + flicker, -0.02, -0.35 - i * 0.04, 0.04);
    ctx.quadraticCurveTo(-0.27 - i * 0.04, 0.12, -0.11 - i * 0.055, 0.09);
    ctx.fill();
  }
  ctx.restore();
  // Feet.
  ctx.fillStyle = dark;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 0.16, 0.28, 0.08, 0.035, side * 0.2, 0, TAU);
    ctx.fill();
  }
  // Body.
  const gradient = ctx.createLinearGradient(-0.2, -0.1, 0.2, 0.2);
  gradient.addColorStop(0, light);
  gradient.addColorStop(0.55, color);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ellipse(ctx, 0, 0.07, 0.25, 0.17);
  ctx.fill();
  outline(ctx, "rgba(5,12,18,.42)", 0.017);
  // Back ridge.
  ctx.fillStyle = "#ffd15c";
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-0.1 + i * 0.09, -0.065);
    ctx.lineTo(-0.06 + i * 0.09, -0.13);
    ctx.lineTo(-0.02 + i * 0.09, -0.055);
    ctx.fill();
  }
  // Head.
  ctx.fillStyle = color;
  ellipse(ctx, 0.17, 0.0, 0.12, 0.1);
  ctx.fill();
  outline(ctx, "rgba(5,12,18,.35)", 0.012);
  eye(ctx, 0.2, -0.02, 0.035, 1, 0);
  // Nostril.
  ctx.fillStyle = dark;
  fillCircle(ctx, 0.27, 0.02, 0.012);
  // Little smile.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.01;
  ctx.beginPath();
  ctx.arc(0.23, 0.055, 0.035, 0.2, Math.PI - 0.4);
  ctx.stroke();
}

function drawCoward(ctx, enemy, color, dark, light, time) {
  const shake = Math.sin(enemy.anim * 11) * 0.012;
  ctx.translate(shake, 0);
  // Little legs.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.03;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.08, 0.2);
    ctx.lineTo(side * 0.1 + Math.sin(enemy.anim * 14 + side) * 0.02, 0.29);
    ctx.stroke();
  }
  // Mushroom cap.
  const gradient = ctx.createLinearGradient(0, -0.3, 0, 0.15);
  gradient.addColorStop(0, light);
  gradient.addColorStop(0.55, color);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, -0.04, 0.27, 0.21, 0, Math.PI, TAU);
  ctx.quadraticCurveTo(0.2, 0.12, 0, 0.14);
  ctx.quadraticCurveTo(-0.2, 0.12, -0.27, -0.04);
  ctx.fill();
  outline(ctx, "rgba(4,12,18,.42)", 0.018);
  // Spots.
  ctx.fillStyle = withAlpha("#ffffff", 0.28);
  fillCircle(ctx, -0.13, -0.13, 0.04);
  fillCircle(ctx, 0.11, -0.17, 0.024);
  fillCircle(ctx, 0.19, -0.07, 0.016);
  // Face.
  ctx.fillStyle = withAlpha("#f7e7d2", 0.7);
  ellipse(ctx, 0, 0.08, 0.15, 0.09);
  ctx.fill();
  eye(ctx, -0.07, 0.05, 0.047, 0, 0);
  eye(ctx, 0.07, 0.05, 0.047, 0, 0);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.013;
  ctx.beginPath();
  ctx.arc(0, 0.13, 0.035, Math.PI + 0.25, TAU - 0.25);
  ctx.stroke();
  // Sweat drop.
  ctx.fillStyle = "#bce7ff";
  ctx.beginPath();
  ctx.moveTo(0.21, -0.06);
  ctx.quadraticCurveTo(0.26, 0.02, 0.21, 0.025);
  ctx.quadraticCurveTo(0.16, 0.02, 0.21, -0.06);
  ctx.fill();
}

function drawPhantom(ctx, enemy, color, dark, light, time) {
  const float = Math.sin(enemy.anim * 2.1 + enemy.phase) * 0.035;
  ctx.translate(0, -0.06 + float);
  ctx.globalAlpha *= 0.62 + Math.sin(time * 3.2) * 0.07;
  const gradient = ctx.createLinearGradient(0, -0.3, 0, 0.25);
  gradient.addColorStop(0, withAlpha(light, 0.75));
  gradient.addColorStop(0.4, withAlpha(color, 0.55));
  gradient.addColorStop(1, withAlpha(dark, 0.12));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(-0.22, 0.24);
  ctx.quadraticCurveTo(-0.3, 0.0, -0.2, -0.19);
  ctx.quadraticCurveTo(0, -0.36, 0.2, -0.19);
  ctx.quadraticCurveTo(0.3, 0.0, 0.22, 0.24);
  ctx.quadraticCurveTo(0.15, 0.16, 0.08, 0.26);
  ctx.quadraticCurveTo(0.0, 0.14, -0.08, 0.26);
  ctx.quadraticCurveTo(-0.15, 0.15, -0.22, 0.24);
  ctx.fill();
  ctx.strokeStyle = withAlpha(light, 0.35);
  ctx.lineWidth = 0.013;
  ctx.stroke();
  // Hood.
  ctx.fillStyle = withAlpha(dark, 0.55);
  ctx.beginPath();
  ctx.ellipse(0, -0.14, 0.145, 0.16, 0, Math.PI, TAU);
  ctx.fill();
  // Eyes.
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = withAlpha(light, 0.95);
  fillCircle(ctx, -0.06, -0.05, 0.03);
  fillCircle(ctx, 0.06, -0.05, 0.03);
  ctx.globalAlpha *= 0.5;
  fillCircle(ctx, -0.06, -0.05, 0.065);
  fillCircle(ctx, 0.06, -0.05, 0.065);
  ctx.globalCompositeOperation = "source-over";
  // Chains.
  ctx.strokeStyle = withAlpha("#d5c9ee", 0.32);
  ctx.lineWidth = 0.009;
  ctx.beginPath();
  ctx.arc(0, 0.07, 0.1, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function drawTrickster(ctx, enemy, color, dark, light, time) {
  const alert = enemy.attackState === "strike";
  const bob = Math.sin(enemy.anim * 2.5) * 0.018;
  ctx.translate(0, bob);
  // Cape.
  ctx.fillStyle = withAlpha(dark, 0.9);
  ctx.beginPath();
  ctx.moveTo(-0.14, -0.14);
  ctx.quadraticCurveTo(-0.33, 0.04, -0.24, 0.3);
  ctx.lineTo(-0.05, 0.2);
  ctx.lineTo(0.05, 0.28);
  ctx.quadraticCurveTo(0.28, 0.13, 0.14, -0.14);
  ctx.fill();
  outline(ctx, "rgba(4,10,16,.4)", 0.012);
  // Body.
  const gradient = ctx.createLinearGradient(-0.15, -0.3, 0.2, 0.25);
  gradient.addColorStop(0, light);
  gradient.addColorStop(0.55, color);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  roundedRect(ctx, -0.16, -0.2, 0.32, 0.4, 0.13);
  ctx.fill();
  outline(ctx, "rgba(4,12,18,.42)", 0.016);
  // Mask face.
  ctx.fillStyle = "#f5efe3";
  ctx.beginPath();
  ctx.ellipse(0, -0.1, 0.14, 0.12, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.009;
  ctx.stroke();
  // Eye slits.
  ctx.fillStyle = alert ? "#ff4f78" : "#342231";
  ctx.beginPath();
  ctx.moveTo(-0.105, -0.13);
  ctx.quadraticCurveTo(-0.06, -0.16, -0.026, -0.12);
  ctx.quadraticCurveTo(-0.066, -0.085, -0.105, -0.13);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0.105, -0.13);
  ctx.quadraticCurveTo(0.06, -0.16, 0.026, -0.12);
  ctx.quadraticCurveTo(0.066, -0.085, 0.105, -0.13);
  ctx.fill();
  // Grin.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.011;
  ctx.beginPath();
  ctx.arc(0, -0.045, 0.07, 0.2, Math.PI - 0.2);
  ctx.stroke();
  for (let i = -2; i <= 2; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 0.025, -0.02);
    ctx.lineTo(i * 0.022, 0.0);
    ctx.stroke();
  }
  // Horns.
  ctx.fillStyle = alert ? "#ffd273" : "#d7b264";
  ctx.beginPath();
  ctx.moveTo(-0.12, -0.24);
  ctx.quadraticCurveTo(-0.23, -0.34, -0.06, -0.3);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0.12, -0.24);
  ctx.quadraticCurveTo(0.23, -0.34, 0.06, -0.3);
  ctx.fill();
  // Belt bells.
  ctx.fillStyle = "#ffcf6b";
  fillCircle(ctx, -0.08, 0.13, 0.02);
  fillCircle(ctx, 0.08, 0.13, 0.02);
}

function drawSplitter(ctx, enemy, color, dark, light, time) {
  const t = enemy.anim * 4.4;
  const wobble = 1 + Math.sin(t) * 0.03;
  ctx.scale(wobble, 2 - wobble);
  ctx.fillStyle = withAlpha(dark, 0.55);
  ellipse(ctx, 0, 0.17, 0.34, 0.1);
  ctx.fill();
  const gradient = ctx.createRadialGradient(-0.08, -0.1, 0.02, 0, 0.04, 0.34);
  gradient.addColorStop(0, light);
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(1, withAlpha(dark, 0.82));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(-0.27, 0.14);
  ctx.bezierCurveTo(-0.33, -0.16, -0.13, -0.25, 0, -0.24);
  ctx.bezierCurveTo(0.14, -0.25, 0.33, -0.16, 0.27, 0.14);
  ctx.quadraticCurveTo(0, 0.28, -0.27, 0.14);
  ctx.fill();
  ctx.strokeStyle = withAlpha("#d7fff5", 0.55);
  ctx.lineWidth = 0.016;
  ctx.stroke();
  // Two inner cores.
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = withAlpha(light, 0.7);
  fillCircle(ctx, -0.08, 0.02, 0.055 + Math.sin(t * 1.2) * 0.007);
  fillCircle(ctx, 0.08, 0.02, 0.055 + Math.cos(t * 1.2) * 0.007);
  ctx.globalCompositeOperation = "source-over";
  // Cute face.
  eye(ctx, -0.075, -0.08, 0.035, 1, 0);
  eye(ctx, 0.075, -0.08, 0.035, 1, 0);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.011;
  ctx.beginPath();
  ctx.arc(0, 0.01, 0.03, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function drawTurret(ctx, enemy, color, dark, light, time, palette) {
  const charge = enemy.turretCharge || 0;
  const pulse = 0.6 + Math.sin(time * 3.3 + enemy.phase) * 0.25;
  // Base.
  ctx.fillStyle = dark;
  ellipse(ctx, 0, 0.22, 0.36, 0.12);
  ctx.fill();
  ctx.fillStyle = withAlpha(color, 0.28);
  ellipse(ctx, 0, 0.2, 0.28, 0.08);
  ctx.fill();
  // Obelisk.
  const gradient = ctx.createLinearGradient(-0.18, -0.2, 0.22, 0.25);
  gradient.addColorStop(0, light);
  gradient.addColorStop(0.4, color);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(-0.17, 0.2);
  ctx.lineTo(-0.1, -0.18);
  ctx.lineTo(0, -0.3);
  ctx.lineTo(0.1, -0.18);
  ctx.lineTo(0.17, 0.2);
  ctx.quadraticCurveTo(0, 0.26, -0.17, 0.2);
  ctx.fill();
  outline(ctx, "rgba(4,10,16,.46)", 0.017);
  // Rings.
  ctx.strokeStyle = withAlpha(palette.accent, 0.4 + charge * 0.5);
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.ellipse(0, -0.02, 0.28, 0.075, -0.25 + Math.sin(time * 0.7) * 0.1, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -0.02, 0.2, 0.05, 0.6 + Math.sin(time * 0.6 + 1) * 0.1, 0, TAU);
  ctx.stroke();
  // Eye.
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = withAlpha(palette.accent, 0.35 + charge * 0.5);
  fillCircle(ctx, 0, -0.035, 0.11 + charge * 0.06);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#fdfdf8";
  fillCircle(ctx, 0, -0.035, 0.06);
  ctx.fillStyle = dark;
  fillCircle(ctx, Math.sin(time * 1.7) * 0.014, -0.035, 0.025);
  // Orbiting shards.
  for (let i = 0; i < 4; i += 1) {
    const angle = time * 1.3 + (i * TAU) / 4;
    const x = Math.cos(angle) * 0.3;
    const y = -0.04 + Math.sin(angle) * 0.1;
    ctx.fillStyle = withAlpha(light, 0.65);
    starPath(ctx, x, y, 3, 0.025, 0.009, angle);
    ctx.fill();
  }
  if (enemy.health < enemy.maxHealth) drawHealthPips(ctx, enemy, 0.45);
}

function drawBurrowMound(ctx, enemy, palette, time) {
  const t = time * 5 + enemy.phase;
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.globalAlpha *= 0.9;
  ctx.fillStyle = withAlpha("#05090e", 0.26);
  ellipse(ctx, 0, 0.3, 0.3, 0.09);
  ctx.fill();
  const g = ctx.createRadialGradient(-0.05, 0.1, 0.01, 0, 0.12, 0.32);
  g.addColorStop(0, palette.softTop);
  g.addColorStop(0.7, palette.softFace);
  g.addColorStop(1, withAlpha(palette.softSide, 0.7));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0.14 + Math.sin(t) * 0.012, 0.29, 0.13, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = withAlpha(palette.softSide, 0.7);
  ctx.lineWidth = 0.012;
  ctx.stroke();
  // Pebbles.
  ctx.fillStyle = withAlpha(palette.softTop, 0.8);
  for (let i = 0; i < 4; i += 1) {
    const a = enemy.phase + i * 1.8;
    fillCircle(ctx, Math.cos(a) * 0.18, 0.12 + Math.sin(a) * 0.05, 0.02 + (i % 2) * 0.008);
  }
  // Underground eye hints.
  ctx.fillStyle = withAlpha("#ffbe6d", 0.9);
  fillCircle(ctx, -0.055, 0.09, 0.016);
  fillCircle(ctx, 0.055, 0.09, 0.016);
  // Ripples.
  ctx.strokeStyle = withAlpha(palette.softTop, 0.22);
  ctx.lineWidth = 0.01;
  ctx.beginPath();
  ctx.ellipse(0, 0.15, 0.36 + Math.sin(t) * 0.02, 0.16, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawHealthPips(ctx, enemy, y) {
  const count = Math.max(1, enemy.maxHealth);
  const width = 0.06;
  const gap = 0.018;
  const total = count * width + (count - 1) * gap;
  for (let i = 0; i < count; i += 1) {
    const x = -total / 2 + i * (width + gap);
    ctx.fillStyle = "rgba(3,8,14,.6)";
    roundedRect(ctx, x, y, width, 0.026, 0.01);
    ctx.fill();
    if (i < enemy.health) {
      ctx.fillStyle = i === count - 1 && count === 3 ? "#ffd166" : "#ff6b5e";
      roundedRect(ctx, x, y, width, 0.026, 0.01);
      ctx.fill();
    }
  }
}

export function drawBomb(ctx, bomb, palette, time, tileSize = 1) {
  const z = bomb.z || 0;
  const radius = 0.28;
  const pulse = 1 + Math.sin(time * (bomb.mode === "remote" ? 4 : 8) + bomb.seed) * 0.02;
  ctx.save();
  ctx.translate(bomb.x, bomb.y);

  const shadowScale = 1 - Math.min(0.35, z * 0.5);
  ctx.fillStyle = `rgba(1,5,10,${0.28 - z * 0.25})`;
  ellipse(ctx, 0, 0.31, radius * 1.15 * shadowScale, 0.085 * shadowScale);
  ctx.fill();

  ctx.translate(0, -z);
  if (bomb.kickDirection) {
    ctx.strokeStyle = withAlpha(palette.accent, 0.45);
    ctx.lineWidth = 0.018;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-0.34 - i * 0.06, -0.08 + i * 0.08);
      ctx.lineTo(-0.23 - i * 0.05, -0.08 + i * 0.08);
      ctx.stroke();
    }
  }
  ctx.scale(pulse, pulse);

  // Aura.
  ctx.globalCompositeOperation = "lighter";
  const aura = ctx.createRadialGradient(0, 0, 0.02, 0, 0, 0.5);
  aura.addColorStop(0, withAlpha(palette.accent, 0.18));
  aura.addColorStop(0.5, withAlpha(palette.accent, 0.06));
  aura.addColorStop(1, withAlpha(palette.accent, 0));
  ctx.fillStyle = aura;
  fillCircle(ctx, 0, 0, 0.5);
  ctx.globalCompositeOperation = "source-over";

  // Body.
  const gradient = ctx.createRadialGradient(-0.1, -0.13, 0.02, 0.01, 0.02, radius * 1.28);
  gradient.addColorStop(0, "#7f8796");
  gradient.addColorStop(0.2, "#3a4450");
  gradient.addColorStop(0.58, "#171f29");
  gradient.addColorStop(0.88, "#090d13");
  gradient.addColorStop(1, "#03060a");
  ctx.fillStyle = gradient;
  fillCircle(ctx, 0, 0.03, radius);
  outline(ctx, "rgba(2,6,10,.8)", 0.024);

  // Glowing seams.
  ctx.strokeStyle = withAlpha(palette.accent, 0.28);
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  ctx.arc(0, 0.03, radius * 0.66, -2.4, -1.25);
  ctx.stroke();

  // Glossy highlight.
  ctx.fillStyle = "rgba(255,255,255,.24)";
  ellipse(ctx, -0.1, -0.08, 0.1, 0.055, -0.65);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.09)";
  ellipse(ctx, 0.09, 0.13, 0.08, 0.032, 0.35);
  ctx.fill();

  // Metal collar/fuse.
  ctx.fillStyle = "#59636e";
  roundedRect(ctx, -0.085, -0.3, 0.17, 0.085, 0.025);
  ctx.fill();
  ctx.fillStyle = withAlpha("#fff", 0.15);
  roundedRect(ctx, -0.065, -0.285, 0.05, 0.025, 0.008);
  ctx.fill();

  // Fuse.
  const fuseGrad = ctx.createLinearGradient(0, -0.3, 0.15, -0.42);
  fuseGrad.addColorStop(0, "#9f7e4f");
  fuseGrad.addColorStop(1, "#d5b479");
  ctx.strokeStyle = fuseGrad;
  ctx.lineWidth = 0.027;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -0.29);
  ctx.bezierCurveTo(0.02, -0.4, 0.12, -0.34, 0.13, -0.43);
  ctx.stroke();

  // Spark.
  const spark = 0.5 + Math.sin(time * 18 + bomb.seed) * 0.2;
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = withAlpha("#ffe7aa", spark);
  ctx.beginPath();
  ctx.arc(0.13, -0.43, 0.04 + Math.sin(time * 22) * 0.012, 0, TAU);
  ctx.fill();
  ctx.fillStyle = withAlpha("#ff8a4b", spark * 0.55);
  ctx.beginPath();
  ctx.arc(0.13, -0.43, 0.085, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  if (bomb.kind === "remote" || bomb.mode === "remote") {
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 0.018;
    ctx.beginPath();
    ctx.moveTo(-0.02, -0.105);
    ctx.lineTo(-0.02, -0.2);
    ctx.stroke();
    const blink = Math.sin(time * 6 + bomb.seed) > 0;
    ctx.fillStyle = blink ? "#ffd46e" : "#7b3f2d";
    fillCircle(ctx, -0.02, -0.205, 0.025);
  }

  if (bomb.mode === "proximity") {
    ctx.strokeStyle = withAlpha("#ff7b7b", 0.3 + Math.sin(time * 4) * 0.15);
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.arc(0, 0.03, radius + 0.08 + Math.sin(time * 3) * 0.02, 0, TAU);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawPickup(ctx, pickup, palette, time, options = {}) {
  const def = POWERUPS[pickup.type] || POWERUPS.bomb;
  const bob = Math.sin(time * 3 + (pickup.seed || 0) * 0.01) * 0.045;
  const appear = options.appear ?? 1;
  ctx.save();
  ctx.translate(pickup.x, pickup.y + bob);
  ctx.scale(appear, appear);
  const color = def.color;
  ctx.fillStyle = "rgba(1,5,10,.25)";
  ellipse(ctx, 0, 0.35 - bob * 0.4, 0.26, 0.075);
  ctx.fill();

  // Outer glow.
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createRadialGradient(0, 0, 0.02, 0, 0, 0.46);
  glow.addColorStop(0, withAlpha(color, 0.22));
  glow.addColorStop(0.5, withAlpha(color, 0.08));
  glow.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = glow;
  fillCircle(ctx, 0, 0, 0.46);
  ctx.globalCompositeOperation = "source-over";

  // Card / medallion.
  const gradient = ctx.createLinearGradient(-0.21, -0.2, 0.21, 0.22);
  gradient.addColorStop(0, withAlpha("#f5fbff", 0.18));
  gradient.addColorStop(0.5, withAlpha(color, 0.22));
  gradient.addColorStop(1, withAlpha("#04090f", 0.88));
  ctx.fillStyle = gradient;
  roundedRect(ctx, -0.22, -0.22, 0.44, 0.44, 0.13);
  ctx.fill();
  ctx.strokeStyle = withAlpha(color, 0.75);
  ctx.lineWidth = 0.018;
  ctx.stroke();
  // Rotating diamond ring.
  ctx.save();
  ctx.rotate(time * 0.55 + (pickup.seed || 0) * 0.001);
  ctx.strokeStyle = withAlpha(color, 0.32);
  ctx.lineWidth = 0.01;
  ctx.setLineDash([0.08, 0.06]);
  ctx.beginPath();
  ctx.arc(0, 0, 0.26, 0, TAU);
  ctx.stroke();
  ctx.restore();

  drawPowerupGlyph(ctx, pickup.type, color);
  ctx.restore();
}

export function drawPowerupGlyph(ctx, type, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 0.025;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Glyph tile is 0.32 x 0.32.
  if (type === "range") {
    ctx.beginPath();
    ctx.moveTo(-0.11, 0);
    ctx.lineTo(0.11, 0);
    ctx.moveTo(-0.11, 0);
    ctx.lineTo(-0.055, -0.055);
    ctx.moveTo(-0.11, 0);
    ctx.lineTo(-0.055, 0.055);
    ctx.moveTo(0.11, 0);
    ctx.lineTo(0.055, -0.055);
    ctx.moveTo(0.11, 0);
    ctx.lineTo(0.055, 0.055);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 0.035, 0, TAU);
    ctx.fill();
  } else if (type === "bomb") {
    fillCircle(ctx, 0, 0.01, 0.075);
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.moveTo(0.015, -0.06);
    ctx.quadraticCurveTo(0.09, -0.1, 0.07, -0.145);
    ctx.stroke();
    ctx.fillStyle = "#ffd479";
    fillCircle(ctx, 0.073, -0.15, 0.022);
  } else if (type === "detonator") {
    ctx.beginPath();
    ctx.moveTo(0.02, -0.13);
    ctx.lineTo(-0.06, 0.01);
    ctx.lineTo(0.0, 0.01);
    ctx.lineTo(-0.02, 0.14);
    ctx.lineTo(0.08, -0.02);
    ctx.lineTo(0.015, -0.02);
    ctx.lineTo(0.05, -0.13);
    ctx.closePath();
    ctx.fill();
  } else if (type === "wallpass") {
    ctx.beginPath();
    ctx.moveTo(-0.1, 0.1);
    ctx.lineTo(-0.1, -0.04);
    ctx.arc(0, -0.04, 0.1, Math.PI, 0);
    ctx.lineTo(0.1, 0.1);
    ctx.quadraticCurveTo(0.06, 0.05, 0.02, 0.1);
    ctx.quadraticCurveTo(-0.02, 0.05, -0.06, 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(5,10,15,.5)";
    fillCircle(ctx, -0.035, -0.045, 0.017);
    fillCircle(ctx, 0.035, -0.045, 0.017);
  } else if (type === "throw") {
    ctx.beginPath();
    ctx.moveTo(-0.13, 0.09);
    ctx.lineTo(0.06, -0.07);
    ctx.moveTo(0.06, -0.07);
    ctx.lineTo(-0.004, -0.075);
    ctx.moveTo(0.06, -0.07);
    ctx.lineTo(0.055, 0.002);
    ctx.stroke();
    fillCircle(ctx, 0.095, 0.075, 0.052);
    ctx.fillStyle = "#ffd479";
    ctx.beginPath();
    ctx.moveTo(-0.11, 0.0);
    ctx.lineTo(-0.04, 0.0);
    ctx.lineTo(-0.04, 0.1);
    ctx.stroke();
  } else if (type === "proximity") {
    for (let i = 1; i <= 3; i += 1) {
      ctx.globalAlpha = 0.35 + i * 0.2;
      ctx.beginPath();
      ctx.arc(0, 0.04, i * 0.045, Math.PI + 0.35, TAU - 0.35);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    fillCircle(ctx, 0, 0.085, 0.025);
  } else if (type === "kick") {
    ctx.beginPath();
    ctx.moveTo(-0.1, 0.1);
    ctx.lineTo(-0.1, -0.07);
    ctx.lineTo(-0.03, -0.1);
    ctx.lineTo(0.01, -0.01);
    ctx.lineTo(0.12, 0.05);
    ctx.lineTo(0.1, 0.11);
    ctx.lineTo(-0.02, 0.11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha(color, 0.55);
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(-0.06, 0.02);
    ctx.lineTo(0.06, 0.07);
    ctx.stroke();
  } else if (type === "immunity") {
    ctx.beginPath();
    ctx.moveTo(-0.09, 0.06);
    ctx.quadraticCurveTo(-0.1, -0.08, 0, -0.13);
    ctx.quadraticCurveTo(0.1, -0.08, 0.09, 0.06);
    ctx.quadraticCurveTo(0.02, 0.14, -0.09, 0.06);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -0.04);
    ctx.quadraticCurveTo(0.06, 0.02, 0, 0.08);
    ctx.quadraticCurveTo(-0.06, 0.02, 0, -0.04);
    ctx.fill();
  } else if (type === "armor") {
    ctx.beginPath();
    ctx.moveTo(-0.1, -0.1);
    ctx.lineTo(0.1, -0.1);
    ctx.lineTo(0.08, 0.06);
    ctx.quadraticCurveTo(0, 0.14, -0.08, 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(5,16,23,.55)";
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(0, -0.06);
    ctx.lineTo(0, 0.06);
    ctx.moveTo(-0.055, 0.0);
    ctx.lineTo(0.055, 0.0);
    ctx.stroke();
  } else if (type === "speed") {
    ctx.beginPath();
    ctx.moveTo(-0.12, 0.1);
    ctx.lineTo(-0.03, -0.08);
    ctx.lineTo(0.01, -0.02);
    ctx.lineTo(0.07, -0.1);
    ctx.lineTo(0.1, 0.03);
    ctx.lineTo(0.03, 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha("#ffffff", 0.55);
    ctx.lineWidth = 0.012;
    for (let i = 0; i < 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-0.16, 0.02 + i * 0.05);
      ctx.lineTo(-0.1, 0.02 + i * 0.05);
      ctx.stroke();
    }
  } else if (type === "magnet") {
    ctx.lineWidth = 0.048;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0.0, 0.085, Math.PI, 0);
    ctx.stroke();
    ctx.lineWidth = 0.046;
    ctx.beginPath();
    ctx.moveTo(-0.085, 0.0);
    ctx.lineTo(-0.085, 0.085);
    ctx.moveTo(0.085, 0.0);
    ctx.lineTo(0.085, 0.085);
    ctx.stroke();
    ctx.fillStyle = "#ff8a8a";
    ctx.fillRect(-0.11, 0.075, 0.05, 0.035);
    ctx.fillStyle = "#8fd8ff";
    ctx.fillRect(0.06, 0.075, 0.05, 0.035);
  } else if (type === "phoenix") {
    ctx.save();
    ctx.rotate(-0.25);
    ctx.beginPath();
    ctx.moveTo(0, 0.14);
    ctx.quadraticCurveTo(-0.02, 0, -0.11, -0.06);
    ctx.quadraticCurveTo(-0.03, -0.09, 0, -0.15);
    ctx.quadraticCurveTo(0.04, -0.08, 0.12, -0.05);
    ctx.quadraticCurveTo(0.03, 0.02, 0, 0.14);
    ctx.fill();
    ctx.strokeStyle = withAlpha("#ffffff", 0.55);
    ctx.lineWidth = 0.01;
    ctx.beginPath();
    ctx.moveTo(0, 0.1);
    ctx.lineTo(0, -0.07);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.font = '800 .18px "Manrope", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", 0, 0);
  }
  ctx.restore();
}

export function drawEgg(ctx, egg, palette, time) {
  const def = MOUNTS[egg.type] || MOUNTS.roo;
  const bob = Math.sin(time * 2.6 + (egg.seed || 0)) * 0.035;
  ctx.save();
  ctx.translate(egg.x, egg.y + bob);
  ctx.fillStyle = "rgba(1,5,10,.23)";
  ellipse(ctx, 0, 0.34, 0.23, 0.07);
  ctx.fill();
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createRadialGradient(0, 0, 0.02, 0, 0, 0.45);
  glow.addColorStop(0, withAlpha(def.color, 0.2));
  glow.addColorStop(1, withAlpha(def.color, 0));
  ctx.fillStyle = glow;
  fillCircle(ctx, 0, 0, 0.45);
  ctx.globalCompositeOperation = "source-over";
  // Egg.
  const gradient = ctx.createLinearGradient(-0.15, -0.25, 0.2, 0.25);
  gradient.addColorStop(0, "#f2f2e6");
  gradient.addColorStop(0.45, "#e5e6d5");
  gradient.addColorStop(1, "#aeb6a4");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.18, 0.25, 0, 0, TAU);
  ctx.fill();
  outline(ctx, "rgba(6,15,18,.32)", 0.013);
  // Pattern.
  ctx.fillStyle = withAlpha(def.color, 0.75);
  for (const [x, y, r] of [[-0.06, -0.09, 0.035], [0.08, 0.05, 0.024], [-0.08, 0.08, 0.018], [0.04, -0.16, 0.015]]) {
    fillCircle(ctx, x, y, r);
  }
  // Rune.
  ctx.strokeStyle = withAlpha(def.color, 0.9);
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.moveTo(-0.05, 0.03);
  ctx.lineTo(0.0, -0.03);
  ctx.lineTo(0.05, 0.03);
  ctx.stroke();
  // Cracks / shine.
  ctx.fillStyle = "rgba(255,255,255,.5)";
  ellipse(ctx, -0.065, -0.1, 0.04, 0.022, -0.55);
  ctx.fill();
  // Sparkles.
  const tw = 0.5 + Math.sin(time * 4 + (egg.seed || 0)) * 0.4;
  ctx.fillStyle = withAlpha("#ffffff", 0.6 * tw);
  fillCircle(ctx, 0.2, -0.14, 0.014);
  fillCircle(ctx, -0.19, 0.09, 0.01);
  ctx.restore();
}

export function drawPortal(ctx, x, y, palette, time, active, appear = 1) {
  ctx.save();
  ctx.translate(x, y);
  const pulse = active ? 0.62 + Math.sin(time * 2.2) * 0.08 : 0.3;
  ctx.globalAlpha *= active ? appear : 0.45;
  if (active) {
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(0, 0, 0.02, 0, 0, 0.64);
    glow.addColorStop(0, withAlpha(palette.accent, 0.4 * pulse));
    glow.addColorStop(0.5, withAlpha(palette.accent2, 0.15 * pulse));
    glow.addColorStop(1, withAlpha(palette.accent, 0));
    ctx.fillStyle = glow;
    fillCircle(ctx, 0, 0, 0.64);
    ctx.globalCompositeOperation = "source-over";
  }
  // Stone arch.
  ctx.strokeStyle = active ? withAlpha(palette.accent, 0.8) : withAlpha(palette.wallRune, 0.2);
  ctx.lineWidth = 0.045;
  ctx.beginPath();
  ctx.arc(0, 0.03, 0.31, Math.PI * 0.08, Math.PI * 0.92);
  ctx.stroke();
  ctx.strokeStyle = active ? palette.accent : withAlpha(palette.wallLine, 0.4);
  ctx.lineWidth = 0.018;
  ctx.beginPath();
  ctx.arc(0, 0.03, 0.36, Math.PI * 0.03, Math.PI * 0.97);
  ctx.stroke();
  // Inner vortex.
  if (active) {
    ctx.save();
    ctx.translate(0, 0.03);
    ctx.rotate(time * 0.7);
    for (let i = 0; i < 4; i += 1) {
      const angle = (i * TAU) / 4 + time * 0.3;
      ctx.strokeStyle = withAlpha(i % 2 === 0 ? palette.accent : palette.accent2, 0.45);
      ctx.lineWidth = 0.018;
      ctx.beginPath();
      ctx.arc(0, 0, 0.18 + i * 0.025, angle, angle + 1.5);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = withAlpha(palette.accent, 0.7);
    fillCircle(ctx, 0, 0.03, 0.055 + Math.sin(time * 4) * 0.01);
    ctx.fillStyle = withAlpha("#ffffff", 0.8);
    fillCircle(ctx, 0, 0.03, 0.022);
    ctx.globalCompositeOperation = "source-over";
  } else {
    ctx.strokeStyle = withAlpha(palette.wallRune, 0.2);
    ctx.lineWidth = 0.012;
    ctx.setLineDash([0.05, 0.07]);
    ctx.beginPath();
    ctx.arc(0, 0.03, 0.24, 0, TAU);
    ctx.stroke();
  }
  // Runes on the floor.
  ctx.strokeStyle = active ? withAlpha(palette.accent, 0.5) : withAlpha(palette.wallRune, 0.16);
  ctx.lineWidth = 0.01;
  ctx.setLineDash([0.04, 0.06]);
  ctx.beginPath();
  ctx.ellipse(0, 0.19, 0.38, 0.1, 0, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawFlameCell(ctx, cell, palette, time, tileSize) {
  const t = clamp(cell.life / cell.maxLife, 0, 1);
  const grow = clamp((1 - t) * 5, 0, 1);
  const fade = clamp(t * 1.6, 0, 1);
  const seed = cell.seed || 0;
  const flicker = Math.sin(time * 16 + seed) * 0.035;
  const radius = (0.4 + flicker) * Math.min(1, grow) * (0.7 + fade * 0.3);
  ctx.save();
  ctx.translate(cell.x, cell.y);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha *= Math.min(1, fade * 1.2);

  // Wide heat haze, deliberately restrained so neighbouring cells don't merge
  // into one white disc.
  const glow = ctx.createRadialGradient(0, 0, 0.02, 0, 0, radius * 1.22);
  glow.addColorStop(0, withAlpha(palette.gold, 0.68));
  glow.addColorStop(0.22, withAlpha(palette.danger, 0.42));
  glow.addColorStop(0.58, withAlpha(palette.danger, 0.16));
  glow.addColorStop(1, withAlpha(palette.danger, 0));
  ctx.fillStyle = glow;
  fillCircle(ctx, 0, 0, radius * 1.22);

  // Lobed flame body.
  ctx.beginPath();
  for (let i = 0; i <= 12; i += 1) {
    const angle = (i / 12) * TAU;
    const lobe = 0.79 + Math.sin(angle * 3 + seed * 7 + time * 5) * 0.12;
    const r = radius * lobe;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r * 0.92;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const body = ctx.createRadialGradient(-0.03, -0.03, 0.005, 0, 0, radius);
  body.addColorStop(0, withAlpha("#ffe9a8", 0.58));
  body.addColorStop(0.28, withAlpha(palette.gold, 0.44));
  body.addColorStop(0.64, withAlpha(palette.danger, 0.34));
  body.addColorStop(1, withAlpha(palette.danger, 0.02));
  ctx.fillStyle = body;
  ctx.fill();

  // Focused flame tongues with more orange than white.
  for (let i = 0; i < 6; i += 1) {
    const angle = seed * 0.3 + (i * TAU) / 6 + Math.sin(time * 7 + i + seed) * 0.25;
    const d = radius * (0.18 + (i % 3) * 0.09);
    const x = Math.cos(angle) * d;
    const y = Math.sin(angle) * d;
    const size = radius * (0.26 + Math.sin(time * 9 + i * 1.7 + seed) * 0.07);
    const grad = ctx.createRadialGradient(x, y, 0.01, x, y, size);
    grad.addColorStop(0, withAlpha(i % 2 ? "#ffd27a" : "#ffad5e", 0.7));
    grad.addColorStop(0.45, withAlpha(palette.danger, 0.4));
    grad.addColorStop(1, withAlpha(palette.danger, 0));
    ctx.fillStyle = grad;
    fillCircle(ctx, x, y, size);
  }

  // Tight hot core.
  const core = ctx.createRadialGradient(0, 0, 0.005, 0, 0, radius * 0.3);
  core.addColorStop(0, "rgba(255,255,244,.85)");
  core.addColorStop(0.45, "rgba(255,224,145,.48)");
  core.addColorStop(1, "rgba(255,148,72,0)");
  ctx.fillStyle = core;
  fillCircle(ctx, 0, 0, radius * 0.34);

  // Little embers spitting out of each cell.
  for (let i = 0; i < 3; i += 1) {
    const a = seed * 3.1 + time * 3 + i * 2.1;
    const d = radius * (0.7 + i * 0.08);
    ctx.fillStyle = withAlpha("#ffe4a6", (0.25 + (i % 2) * 0.15) * fade);
    fillCircle(ctx, Math.cos(a) * d, Math.sin(a) * d, 0.012 + (i % 2) * 0.006);
  }
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
}

export function drawTrailFire(ctx, fire, palette, time) {
  const t = clamp(fire.life / fire.maxLife, 0, 1);
  const pulse = 0.8 + Math.sin(time * 8 + fire.seed) * 0.08;
  ctx.save();
  ctx.translate(fire.x, fire.y);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha *= Math.min(1, t * 1.7);
  const grad = ctx.createRadialGradient(0, 0, 0.01, 0, 0, 0.38 * pulse);
  grad.addColorStop(0, withAlpha("#fff6cf", 0.85));
  grad.addColorStop(0.32, withAlpha(palette.gold, 0.6));
  grad.addColorStop(0.7, withAlpha(palette.danger, 0.3));
  grad.addColorStop(1, withAlpha(palette.danger, 0));
  ctx.fillStyle = grad;
  fillCircle(ctx, 0, 0.02, 0.38 * pulse);
  for (let i = 0; i < 3; i += 1) {
    const angle = time * 4 + i * 2.1 + fire.seed;
    const size = 0.1 + Math.sin(time * 7 + i) * 0.02;
    ctx.fillStyle = withAlpha(i === 1 ? "#fff1b0" : palette.danger, 0.35);
    fillCircle(ctx, Math.cos(angle) * 0.12, 0.01 + Math.sin(angle) * 0.1, size);
  }
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
}

export function drawProjectile(ctx, projectile, palette, time) {
  ctx.save();
  ctx.translate(projectile.x, projectile.y);
  const glow = ctx.createRadialGradient(0, 0, 0.01, 0, 0, 0.28);
  glow.addColorStop(0, withAlpha("#ffffff", 0.9));
  glow.addColorStop(0.25, withAlpha(palette.accent2, 0.8));
  glow.addColorStop(1, withAlpha(palette.accent2, 0));
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = glow;
  fillCircle(ctx, 0, 0, 0.28);
  ctx.fillStyle = "#fff";
  fillCircle(ctx, 0, 0, 0.045);
  ctx.strokeStyle = withAlpha(palette.accent, 0.5);
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  ctx.arc(0, 0, 0.12 + Math.sin(time * 8 + projectile.seed) * 0.015, 0, TAU);
  ctx.stroke();
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
}

export function drawEffectRing(ctx, ring) {
  const t = clamp(ring.life / ring.maxLife, 0, 1);
  ctx.save();
  ctx.translate(ring.x, ring.y);
  ctx.globalAlpha *= t;
  ctx.strokeStyle = ring.color;
  ctx.lineWidth = 0.025 * t + 0.005;
  ctx.beginPath();
  ctx.arc(0, 0, ring.radius * (1 - t) + ring.startRadius, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
