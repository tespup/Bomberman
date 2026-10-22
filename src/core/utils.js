export const TAU = Math.PI * 2;

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a || 1);
export const smoothstep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInCubic = (t) => Math.pow(clamp(t, 0, 1), 3);
export const easeOutBack = (t) => {
  const c = 1.70158;
  const n = clamp(t, 0, 1) - 1;
  return 1 + (c + 1) * n * n * n + c * n * n;
};
export const easeOutElastic = (t) => {
  const n = clamp(t, 0, 1);
  return n === 0 || n === 1 ? n : Math.pow(2, -10 * n) * Math.sin((n * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};

export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const dist2 = (x1, y1, x2, y2) => (x2 - x1) ** 2 + (y2 - y1) ** 2;

export const normalize = (x, y) => {
  const l = Math.hypot(x, y);
  return l ? { x: x / l, y: y / l, length: l } : { x: 0, y: 0, length: 0 };
};

export const padNumber = (n, length = 2) => String(Math.max(0, Math.floor(n))).padStart(length, "0");

export const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${padNumber(Math.floor(s / 60))}:${padNumber(s % 60)}`;
};

export const formatScore = (n) => Math.max(0, Math.floor(n || 0)).toLocaleString("ru-RU");

export const shuffle = (array, random = Math.random) => {
  const list = array.slice();
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

export const choose = (array, random = Math.random) => array[Math.floor(random() * array.length)];

export function weightedChoice(items, random = Math.random) {
  const total = items.reduce((sum, item) => sum + (item.weight || 0), 0);
  if (total <= 0) return items[0]?.value;
  let r = random() * total;
  for (const item of items) {
    r -= item.weight || 0;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1]?.value;
}

export const hsl = (h, s, l, a = 1) =>
  a >= 1 ? `hsl(${((h % 360) + 360) % 360} ${clamp(s, 0, 100)}% ${clamp(l, 0, 100)}%)` : `hsla(${((h % 360) + 360) % 360}, ${clamp(s, 0, 100)}%, ${clamp(l, 0, 100)}%, ${clamp(a, 0, 1)})`;

export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToRgb(hex) {
  let value = hex.replace("#", "");
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  const number = Number.parseInt(value, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255
  };
}

export const withAlpha = (hex, alpha) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
};

export const mixColors = (hexA, hexB, amount) => {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const t = clamp(amount, 0, 1);
  const toHex = (v) => Math.round(v).toString(16).padStart(2, "0");
  return `#${toHex(lerp(a.r, b.r, t))}${toHex(lerp(a.g, b.g, t))}${toHex(lerp(a.b, b.b, t))}`;
};

export const lighten = (hex, amount) => mixColors(hex, "#ffffff", amount);
export const darken = (hex, amount) => mixColors(hex, "#000000", amount);

export const pointInRect = (x, y, rx, ry, rw, rh) =>
  x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;

export const clampRect = (rect, maxWidth, maxHeight) => {
  const scale = Math.min(maxWidth / rect.width, maxHeight / rect.height, 1);
  return {
    width: rect.width * scale,
    height: rect.height * scale
  };
};

export function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function ellipse(ctx, x, y, rx, ry, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.001, rx), Math.max(0.001, ry), rotation, 0, TAU);
}

export function fillCircle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.001, r), 0, TAU);
  ctx.fill();
}

export function strokeCircle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.001, r), 0, TAU);
  ctx.stroke();
}

export function starPath(ctx, cx, cy, spikes, outerRadius, innerRadius, rotation = -Math.PI / 2) {
  let rot = rotation;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
  for (let i = 0; i < spikes; i += 1) {
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
  }
  ctx.closePath();
}

export function seededAngle(seed) {
  return (seed % 1000) / 1000 * TAU;
}

export function formatRelativeDate(timestamp) {
  if (!timestamp) return "давно";
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "только что";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`;
  return new Date(timestamp).toLocaleDateString("ru-RU");
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage can be unavailable in sandboxed webviews */
  }
}

/** Small debounce used by resize handlers. */
export function debounce(fn, wait = 80) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

export const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

export function generateId(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
