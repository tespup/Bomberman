/** Deterministic 32-bit seeded RNG (mulberry32) with convenience helpers. */
export class RNG {
  constructor(seed = 1) {
    this.seed = typeof seed === "string" ? hashString(seed) : seed >>> 0;
    this.state = this.seed || 0x9e3779b9;
    this._count = 0;
  }

  next() {
    this._count += 1;
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min = 0, max = 1) {
    return min + this.next() * (max - min);
  }

  int(min, maxInclusive) {
    return Math.floor(this.float(min, maxInclusive + 1));
  }

  chance(probability = 0.5) {
    return this.next() < probability;
  }

  pick(array) {
    if (!array.length) return undefined;
    return array[Math.floor(this.next() * array.length)];
  }

  weighted(entries) {
    const total = entries.reduce((sum, [value, weight]) => sum + weight, 0);
    let roll = this.next() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    return entries[entries.length - 1]?.[0];
  }

  shuffle(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  angle() {
    return this.next() * Math.PI * 2;
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  fork(salt = "") {
    return new RNG(hashString(`${this.seed}:${this._count}:${salt}`));
  }

  save() {
    return { state: this.state, count: this._count };
  }

  restore(snapshot) {
    this.state = snapshot.state;
    this._count = snapshot.count;
  }
}

export function hashString(input) {
  const str = String(input);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)) >>> 0;
}

export function hash2d(x, y, seed = 0) {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise2d(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2d(x0, y0, seed);
  const b = hash2d(x0 + 1, y0, seed);
  const c = hash2d(x0, y0 + 1, seed);
  const d = hash2d(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

export const levelSeed = (level, salt = 0) => hashString(`bombman:campaign:${level}:${salt}`);
export const versusSeed = (round, salt = 0) => hashString(`bombman:versus:${round}:${salt}:${Date.now() % 100000}`);
