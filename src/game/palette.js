import { RNG, levelSeed } from "../core/rng.js";
import { clamp, hslToHex, lighten, darken, mixColors } from "../core/utils.js";
import { THEMES } from "./catalog.js";

/**
 * Every one of the 50 stages receives a fresh, deterministic palette.
 * A shared theme gives each world its material language; hue, saturation,
 * contrast, glow and accent are re-rolled so no two stages look alike.
 */
export function getThemeForLevel(level) {
  const index = clamp(level - 1, 0, 49);
  const tier = Math.floor(index / 10);
  const position = index % 10;
  const themeIndex = (position + tier * 3) % THEMES.length;
  return {
    theme: THEMES[themeIndex],
    variant: tier % 5,
    themeIndex,
    tier
  };
}

export function createPalette(level, seedOverride = null) {
  const index = clamp(level - 1, 0, 49);
  const { theme, variant } = getThemeForLevel(level);
  const rng = new RNG(seedOverride ?? levelSeed(level, 77));

  const variantHue = (variant - 2) * 18;
  const hueJitter = rng.float(-16, 16);
  const floorHue = theme.hue + hueJitter + variantHue;
  const wallHue = theme.wallHue + hueJitter * 0.55 + variantHue * 0.72;
  const accentHue = theme.accentHue + rng.float(-13, 13) + variantHue * 0.55;
  const accent2Hue = accentHue + rng.float(28, 74);
  const dangerHue = rng.chance(0.25) ? accentHue + 32 : 5 + rng.float(-5, 5);

  const floorS = clamp(theme.floorS + rng.float(-4, 6) + variant * 1.7, 12, 55);
  const floorL = clamp(theme.floorL + rng.float(-2.2, 3.2) + (variant % 3) * 1.15, 10, 32);
  const wallS = clamp(theme.wallS + rng.float(-4, 5) + variant * 1.2, 8, 49);
  const wallL = clamp(theme.wallL + rng.float(-2, 4) + (variant % 2) * 1.4, 18, 40);
  const accentL = theme.id === "candy" ? 66 : 59;

  const accent = hslToHex(accentHue, rng.float(62, 86), accentL);
  const accent2 = hslToHex(accent2Hue, rng.float(55, 80), accentL + rng.float(-5, 5));
  const danger = hslToHex(dangerHue, 88, 57);
  const glow = hslToHex(accentHue, 91, 69);

  const bgTop = hslToHex(theme.bgHue + hueJitter * 0.3 - 7, clamp(35 + floorS * 0.35, 28, 55), 5 + rng.float(0, 2.2));
  const bgBottom = hslToHex(theme.bgHue + hueJitter * 0.15 + 18, clamp(31 + floorS * 0.28, 25, 48), 3.1);
  const bgMid = hslToHex(theme.bgHue + hueJitter * 0.2, clamp(28 + floorS * 0.3, 24, 50), 8);

  const floorA = hslToHex(floorHue, floorS, floorL);
  const floorB = hslToHex(floorHue + rng.float(4, 13), floorS + rng.float(-2, 5), floorL + rng.float(2.2, 5.2));
  const floorC = hslToHex(floorHue - rng.float(5, 12), floorS + 4, floorL - rng.float(2, 4));
  const floorLine = hslToHex(floorHue, floorS + 8, floorL - rng.float(5.5, 8));
  const floorGlow = hslToHex(accentHue, 80, floorL + rng.float(5, 13));

  const wallFace = hslToHex(wallHue, wallS, wallL);
  const wallTop = hslToHex(wallHue + rng.float(-4, 7), wallS + 4, wallL + rng.float(7, 12));
  const wallSide = hslToHex(wallHue, wallS + 4, wallL - rng.float(8, 12));
  const wallDeep = hslToHex(wallHue - 4, wallS + 8, Math.max(7, wallL - 17));
  const wallLine = hslToHex(wallHue + rng.float(-9, 9), wallS + 6, wallL - rng.float(2, 6));
  const wallRune = hslToHex(accentHue + rng.float(-12, 12), 72, Math.min(76, wallL + 24));

  const softHues = {
    emerald: 31,
    volcanic: 9,
    frozen: 199,
    cyber: 263,
    candy: 332,
    cosmic: 253,
    ocean: 9,
    desert: 37,
    toxic: 91,
    royal: 344
  };
  const softHue = (softHues[theme.id] ?? floorHue + 24) + rng.float(-5, 5);
  const softSat = theme.id === "ruins" || theme.id === "sand" ? 46 : clamp(floorS + 14, 25, 65);
  const softFace = hslToHex(softHue, softSat, clamp(floorL + 12, 25, 48));
  const softTop = hslToHex(softHue + 4, clamp(softSat + 5, 30, 70), clamp(floorL + 23, 35, 58));
  const softSide = hslToHex(softHue - 6, clamp(softSat - 4, 24, 58), clamp(floorL + 4, 19, 39));

  const hazeA = hslToHex(theme.bgHue + 15, 65, 39);
  const hazeB = hslToHex(accentHue, 76, 52);

  return {
    level,
    themeId: theme.id,
    style: theme.style,
    particle: theme.particle,
    softStyle: theme.soft,
    fog: theme.fog,
    variant,
    name: theme.names[variant % theme.names.length],
    description: theme.descriptions[variant % theme.descriptions.length],
    hues: {
      base: floorHue,
      wall: wallHue,
      accent: accentHue,
      accent2: accent2Hue,
      danger: dangerHue,
      enemy: accentHue + rng.float(130, 220)
    },
    bgTop,
    bgMid,
    bgBottom,
    bgGlow: hazeA,
    floorA,
    floorB,
    floorC,
    floorLine,
    floorGlow,
    wallFace,
    wallTop,
    wallSide,
    wallDeep,
    wallLine,
    wallRune,
    softFace,
    softTop,
    softSide,
    accent,
    accent2,
    accentSoft: mixColors(accent, floorB, 0.35),
    danger,
    dangerDark: darken(danger, 0.4),
    glow,
    glowSoft: lighten(glow, 0.22),
    hazeA,
    hazeB,
    shadow: hslToHex(theme.bgHue + 8, 50, 4),
    ink: hslToHex(theme.bgHue, 30, 7),
    frost: hslToHex(accentHue, 82, 88),
    gold: hslToHex(accentHue + 18, 84, 65),
    white: "#f8f2e6"
  };
}

/** A compact preview object for the level-select cards. */
export function palettePreview(palette) {
  return {
    floor: palette.floorA,
    wall: palette.wallSide,
    accent: palette.accent,
    glow: palette.glow
  };
}
