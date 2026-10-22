import { safeStorageGet, safeStorageSet, safeStorageRemove, clamp } from "./utils.js";

const SAVE_KEY = "bombman.save.v2";
const SAVE_VERSION = 3;
const RUN_POWER_KEYS = [
  "range",
  "detonator",
  "bomb",
  "wallpass",
  "throw",
  "proximity",
  "kick",
  "immunity",
  "armor",
  "speed",
  "magnet",
  "phoenix"
];
const RUN_MOUNT_KEYS = ["roo", "drake", "gloom"];
export const TOTAL_LEVELS = 50;
export const MAX_STARS = TOTAL_LEVELS * 3;

export const DEFAULT_KEYS = {
  p1: {
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
    bomb: "Space",
    detonate: "KeyQ",
    action: "KeyE"
  },
  p2: {
    up: "KeyW",
    down: "KeyS",
    left: "KeyA",
    right: "KeyD",
    bomb: "KeyF",
    detonate: "KeyG",
    action: "KeyH"
  }
};

const clone = (value) => JSON.parse(JSON.stringify(value));

export const DEFAULT_SETTINGS = {
  music: true,
  musicVolume: 0.55,
  sfx: true,
  sfxVolume: 0.72,
  screenShake: true,
  particles: "high",
  showFps: false,
  touchSize: "normal",
  keys: clone(DEFAULT_KEYS)
};

function makeDefaultSave() {
  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    progress: {
      unlocked: 1,
      completed: [],
      levels: {}
    },
    settings: clone(DEFAULT_SETTINGS),
    stats: {
      totalRuns: 0,
      wins: 0,
      bestScore: 0,
      totalKills: 0,
      totalBombs: 0,
      playTime: 0
    },
    run: {
      loadout: null
    },
    profile: {
      name: "",
      skin: "classic"
    },
    flags: {
      tutorialSeen: false,
      introSeen: false
    }
  };
}

function deepMerge(base, incoming) {
  if (Array.isArray(base)) return Array.isArray(incoming) ? incoming : base.slice();
  if (base && typeof base === "object") {
    const out = { ...base };
    if (!incoming || typeof incoming !== "object") return out;
    for (const [key, value] of Object.entries(incoming)) {
      if (key in base) out[key] = deepMerge(base[key], value);
      else out[key] = value;
    }
    return out;
  }
  return incoming === undefined ? base : incoming;
}

function sanitizeLoadout(raw) {
  if (!raw || typeof raw !== "object") return null;
  const powers = Array.isArray(raw.powers)
    ? [...new Set(raw.powers.filter((key) => RUN_POWER_KEYS.includes(key)))]
    : [];
  const powerLevels = {};
  if (raw.powerLevels && typeof raw.powerLevels === "object") {
    for (const key of ["range", "bomb", "speed", "armor", "phoenix"]) {
      const value = Number(raw.powerLevels[key]);
      if (Number.isFinite(value) && value > 0) powerLevels[key] = clamp(Math.floor(value), 0, 10);
    }
  }
  return {
    baseRange: clamp(Math.floor(Number(raw.baseRange) || 1), 1, 9),
    baseBombs: clamp(Math.floor(Number(raw.baseBombs) || 1), 1, 7),
    speedLevels: clamp(Math.floor(Number(raw.speedLevels) || 0), 0, 4),
    maxHearts: clamp(Math.floor(Number(raw.maxHearts) || 3), 1, 6),
    armor: clamp(Math.floor(Number(raw.armor) || 0), 0, 3),
    powers,
    powerLevels,
    mountKey: RUN_MOUNT_KEYS.includes(raw.mountKey) ? raw.mountKey : null
  };
}

function sanitizeSave(raw) {
  const defaults = makeDefaultSave();
  if (!raw || typeof raw !== "object") return defaults;
  const merged = deepMerge(defaults, raw);

  const unlocked = clamp(Number(merged.progress?.unlocked) || 1, 1, TOTAL_LEVELS);
  const completed = Array.isArray(merged.progress?.completed)
    ? [...new Set(merged.progress.completed.map(Number).filter((n) => n >= 1 && n <= TOTAL_LEVELS))]
    : [];
  const levels = {};
  for (const [key, entry] of Object.entries(merged.progress?.levels || {})) {
    const number = Number(key);
    if (!Number.isInteger(number) || number < 1 || number > TOTAL_LEVELS) continue;
    levels[number] = {
      stars: clamp(Number(entry?.stars) || 0, 0, 3),
      score: Math.max(0, Number(entry?.score) || 0),
      time: Math.max(0, Number(entry?.time) || 0),
      bestAt: Number(entry?.bestAt) || 0
    };
  }

  merged.progress = { unlocked, completed, levels };
  merged.settings.musicVolume = clamp(Number(merged.settings.musicVolume) || 0, 0, 1);
  merged.settings.sfxVolume = clamp(Number(merged.settings.sfxVolume) || 0, 0, 1);
  if (!["low", "medium", "high"].includes(merged.settings.particles)) merged.settings.particles = "high";
  if (!["compact", "normal", "large"].includes(merged.settings.touchSize)) merged.settings.touchSize = "normal";
  merged.settings.music = Boolean(merged.settings.music);
  merged.settings.sfx = Boolean(merged.settings.sfx);
  merged.settings.screenShake = Boolean(merged.settings.screenShake);
  merged.settings.showFps = Boolean(merged.settings.showFps);

  for (const player of ["p1", "p2"]) {
    if (!merged.settings.keys[player] || typeof merged.settings.keys[player] !== "object") {
      merged.settings.keys[player] = { ...DEFAULT_KEYS[player] };
    }
    for (const action of Object.keys(DEFAULT_KEYS[player])) {
      const value = merged.settings.keys[player][action];
      // Empty string is a valid state: the action is intentionally unbound
      // because another player took that key.
      if (typeof value !== "string") merged.settings.keys[player][action] = DEFAULT_KEYS[player][action];
    }
  }

  merged.stats.totalRuns = Math.max(0, Number(merged.stats.totalRuns) || 0);
  merged.stats.wins = Math.max(0, Number(merged.stats.wins) || 0);
  merged.stats.bestScore = Math.max(0, Number(merged.stats.bestScore) || 0);
  merged.stats.totalKills = Math.max(0, Number(merged.stats.totalKills) || 0);
  merged.stats.totalBombs = Math.max(0, Number(merged.stats.totalBombs) || 0);
  merged.stats.playTime = Math.max(0, Number(merged.stats.playTime) || 0);
  merged.profile.name = typeof merged.profile.name === "string" ? merged.profile.name.slice(0, 40) : "";
  merged.run = { loadout: sanitizeLoadout(merged.run?.loadout) };
  merged.version = SAVE_VERSION;
  return merged;
}

export class SaveManager {
  constructor() {
    this.data = this.load();
    this._saveTimer = null;
  }

  load() {
    const raw = safeStorageGet(SAVE_KEY);
    if (!raw) return makeDefaultSave();
    try {
      return sanitizeSave(JSON.parse(raw));
    } catch {
      return makeDefaultSave();
    }
  }

  save(immediate = false) {
    this.data.updatedAt = Date.now();
    if (immediate) {
      safeStorageSet(SAVE_KEY, JSON.stringify(this.data));
      return;
    }
    clearTimeout(this._saveTimer);
    this._saveTimer = window.setTimeout(() => {
      safeStorageSet(SAVE_KEY, JSON.stringify(this.data));
    }, 120);
  }

  resetProgress() {
    const settings = this.data.settings;
    const profile = this.data.profile;
    const fresh = makeDefaultSave();
    fresh.settings = settings;
    fresh.profile = profile;
    this.data = fresh;
    this.save(true);
  }

  resetAll() {
    safeStorageRemove(SAVE_KEY);
    this.data = makeDefaultSave();
    this.save(true);
  }

  get settings() {
    return this.data.settings;
  }

  get progress() {
    return this.data.progress;
  }

  get stats() {
    return this.data.stats;
  }

  get flags() {
    return this.data.flags;
  }

  get run() {
    return this.data.run;
  }

  setRunLoadout(loadout) {
    if (!this.data.run) this.data.run = { loadout: null };
    this.data.run.loadout = sanitizeLoadout(loadout);
    this.save(true);
  }

  clearRunLoadout() {
    if (!this.data.run) this.data.run = { loadout: null };
    this.data.run.loadout = null;
    this.save(true);
  }

  get totalScore() {
    return Object.values(this.progress.levels).reduce((sum, level) => sum + (level.score || 0), 0);
  }

  get totalStars() {
    return Object.values(this.progress.levels).reduce((sum, level) => sum + (level.stars || 0), 0);
  }

  get completedCount() {
    return this.progress.completed.length;
  }

  isLevelUnlocked(level) {
    return level <= this.progress.unlocked;
  }

  isLevelComplete(level) {
    return this.progress.completed.includes(level);
  }

  getBest(level) {
    return this.progress.levels[level] || null;
  }

  recordLevelResult(level, { score = 0, time = 0, stars = 1, kills = 0, bombs = 0 } = {}) {
    const number = clamp(Number(level) || 1, 1, TOTAL_LEVELS);
    const previous = this.progress.levels[number] || null;
    const isNewBest = !previous || score > previous.score;
    this.progress.levels[number] = {
      stars: Math.max(previous?.stars || 0, clamp(stars, 1, 3)),
      score: Math.max(previous?.score || 0, Math.floor(score)),
      time: previous?.time && previous.time <= time ? previous.time : Math.floor(time),
      bestAt: Date.now()
    };
    if (!this.progress.completed.includes(number)) this.progress.completed.push(number);
    this.progress.unlocked = Math.min(TOTAL_LEVELS, Math.max(this.progress.unlocked, number + 1));
    this.stats.totalKills += Math.max(0, kills);
    this.stats.totalBombs += Math.max(0, bombs);
    this.stats.bestScore = Math.max(this.stats.bestScore, Math.floor(score));
    if (number === TOTAL_LEVELS) this.stats.wins += 1;
    this.save(true);
    return { isNewBest, previous };
  }

  recordRunStart() {
    this.stats.totalRuns += 1;
    this.save();
  }

  updateSettings(partial) {
    this.data.settings = deepMerge(this.data.settings, partial);
    this.save(true);
    return this.data.settings;
  }

  updateProfile(partial) {
    this.data.profile = deepMerge(this.data.profile, partial);
    this.save();
  }

  markTutorialSeen() {
    this.data.flags.tutorialSeen = true;
    this.save();
  }

  exportData() {
    return JSON.stringify(this.data);
  }

  importData(raw) {
    try {
      const next = sanitizeSave(JSON.parse(raw));
      this.data = next;
      this.save(true);
      return true;
    } catch {
      return false;
    }
  }
}

export const saveManager = new SaveManager();
