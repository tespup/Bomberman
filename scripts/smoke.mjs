#!/usr/bin/env node
/**
 * Dependency-free browser smoke test using Chrome DevTools Protocol.
 * Run with full filesystem access on Windows because Chrome's IPC is blocked
 * by the DSH file sandbox.
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";

const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9500 + Math.floor(Math.random() * 400);
const ROOT = resolve(process.cwd());
const OUT = join(ROOT, "artifacts");
const PROFILE = join(ROOT, `.chrome-smoke-${Date.now()}`);
const BASE_URL = "http://127.0.0.1:4173/";

mkdirSync(OUT, { recursive: true });
mkdirSync(PROFILE, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-crash-reporter",
    "--disable-breakpad",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${PROFILE}`,
    "--hide-scrollbars",
    "--window-size=1440,900",
    `--remote-debugging-port=${PORT}`,
    "about:blank"
  ],
  { stdio: "ignore", windowsHide: true }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForEndpoint() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return response.json();
    } catch {}
    await sleep(150);
  }
  throw new Error("Chrome DevTools endpoint did not start");
}

class CDP {
  constructor(wsUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ws = new WebSocket(wsUrl);
    this.ready = new Promise((resolvePromise, reject) => {
      this.ws.addEventListener("open", () => resolvePromise());
      this.ws.addEventListener("error", (event) => reject(event));
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const entry = this.pending.get(message.id);
        if (entry) {
          this.pending.delete(message.id);
          if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
          else entry.resolve(message.result);
        }
      } else {
        this.events.push(message);
      }
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

const version = await waitForEndpoint();
const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = pages.find((item) => item.type === "page");
const cdp = new CDP(page.webSocketDebuggerUrl);

const consoleErrors = [];
const exceptions = [];

function expect(condition, message) {
  if (!condition) throw new Error(`EXPECTATION FAILED: ${message}`);
}

function watchEvents() {
  const timer = setInterval(() => {
    while (cdp.events.length) {
      const event = cdp.events.shift();
      if (event.method === "Runtime.consoleAPICalled" && event.params.type === "error") {
        consoleErrors.push(
          `${event.params.type}: ${event.params.args.map((a) => a.value ?? a.description ?? a.type).join(" ")}`
        );
      }
      if (event.method === "Runtime.exceptionThrown") {
        exceptions.push(
          `${event.params.exceptionDetails.text}: ${event.params.exceptionDetails.exception?.description || ""}`
        );
      }
    }
  }, 50);
  return timer;
}

await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Log.enable");
const eventTimer = watchEvents();

async function evaluate(expression, awaitPromise = true) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function screenshot(name) {
  await sleep(250);
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(OUT, name), Buffer.from(result.data, "base64"));
  console.log("screenshot:", name);
}

async function navigate(url) {
  const expected = new URL(url);
  const expectedLocation = expected.pathname + expected.search;
  await cdp.send("Page.navigate", { url });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await sleep(150);
    try {
      const ready = await evaluate(`(() => {
        const expected = ${JSON.stringify(expectedLocation)};
        const current = location.pathname + location.search;
        return current === expected && Boolean(window.__BOMBMAN__) && Boolean(document.querySelector("#bootPlay"));
      })()`);
      if (ready) return;
    } catch {
      /* execution context can be replaced while navigating */
    }
  }
  throw new Error(`Page did not become ready: ${url}`);
}

async function click(selector) {
  const result = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return 'missing';
    el.click();
    return 'ok';
  })()`);
  if (result !== "ok") throw new Error(`Cannot click ${selector}: ${result}`);
  await sleep(500);
}

async function key(code, keyValue, type = "keyDown") {
  await cdp.send("Input.dispatchKeyEvent", {
    type,
    windowsVirtualKeyCode:
      code.startsWith("Arrow") ? { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 }[code] : keyValue?.charCodeAt?.(0) || 0,
    nativeVirtualKeyCode: 0,
    code,
    key: keyValue
  });
}

try {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await navigate(BASE_URL);
  console.log("booted DOM:", await evaluate("document.readyState"));
  const bootName = await evaluate("document.querySelector('.boot-logo')?.innerText");
  console.log("logo:", bootName);
  await screenshot("01-boot.png");
  await click("#bootPlay");
  await sleep(1200);
  await screenshot("02-home-desktop.png");
  expect((await evaluate("document.body.dataset.screen")) === "home", "home screen should be active");
  console.log("menu canvas:", await evaluate("(() => { const m = window.__BOMBMAN__.menuScene; return { width: m.width, height: m.height, palette: m.palette?.name }; })()"));

  // Level selection and codex.
  await click("[data-action=levels]");
  await sleep(400);
  await screenshot("02c-levels.png");
  await click("[data-action=home]");
  await click("[data-action=guide]");
  await sleep(350);
  await screenshot("02d-codex.png");
  await click("[data-modal-close]");

  // Campaign start.
  await click("[data-action=campaign]");
  await sleep(500);
  const introActive = await evaluate("!!document.querySelector('[data-intro-start]')");
  expect(introActive, "level intro should be visible");
  await screenshot("03-intro.png");
  await click("[data-intro-start]");
  await sleep(900);
  const gameState = await evaluate("window.__BOMBMAN__.game.state");
  const levelNumber = await evaluate("window.__BOMBMAN__.game.levelNumber");
  const enemies = await evaluate("window.__BOMBMAN__.game.getEnemiesRemaining()");
  expect(gameState === "playing", `game should be playing, got ${gameState}`);
  expect(levelNumber === 1, `expected level 1, got ${levelNumber}`);
  expect(enemies >= 3, `expected enemies, got ${enemies}`);
  console.log("state:", gameState, "level:", levelNumber, "enemies:", enemies);
  console.log("canvas:", await evaluate("(() => { const c=document.getElementById('gameCanvas'); return {w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight}; })()"));
  await screenshot("04-game-desktop.png");

  // Move and place a bomb.
  await key("ArrowRight", "ArrowRight", "keyDown");
  await sleep(450);
  await key("ArrowRight", "ArrowRight", "keyUp");
  await key("Space", " ", "keyDown");
  await key("Space", " ", "keyUp");
  await sleep(2800);
  console.log("bombs after explosion:", await evaluate("window.__BOMBMAN__.game.bombs.length"));
  console.log("blocks destroyed:", await evaluate("window.__BOMBMAN__.game.blocksDestroyed"));
  await screenshot("05-game-after-bomb.png");

  // Pause screen.
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", code: "Escape", key: "Escape", windowsVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", code: "Escape", key: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(500);
  const pausedState = await evaluate("window.__BOMBMAN__.game.state");
  expect(pausedState === "paused", `expected paused, got ${pausedState}`);
  console.log("paused:", pausedState);
  await screenshot("06-pause.png");

  await click("[data-pause=settings]");
  await sleep(500);
  await screenshot("07-settings.png");
  await click("[data-settings-tab=controls]");
  await sleep(250);
  await screenshot("07b-settings-controls.png");

  // Rebind P1 "right" to D. D already belongs to P2, so P2's binding must be
  // cleared (not swapped), then the new key must actually move the player.
  await click("[data-bind-player=p1][data-bind-action=right]");
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", code: "KeyD", key: "d", windowsVirtualKeyCode: 68 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", code: "KeyD", key: "d", windowsVirtualKeyCode: 68 });
  await sleep(250);
  const reboundP1 = await evaluate("window.__BOMBMAN__.settings.keys.p1.right");
  const clearedP2 = await evaluate("window.__BOMBMAN__.settings.keys.p2.right");
  const persistedP2 = await evaluate("JSON.parse(localStorage.getItem('bombman.save.v2')).settings.keys.p2.right");
  expect(reboundP1 === "KeyD", `P1 rebind failed: ${reboundP1}`);
  expect(clearedP2 === "", `P2 key should have been cleared, got ${clearedP2}`);
  expect(persistedP2 === "", `P2 cleared key was not persisted, got ${persistedP2}`);
  console.log("key taken from P2:", { p1Right: reboundP1, p2Right: clearedP2, persistedP2 });
  await click("[data-modal-close]");
  await evaluate("window.__BOMBMAN__.resumeGame()");

  // The new key must actually move the player, not just change the label.
  await evaluate(`(() => {
    const game = window.__BOMBMAN__.game;
    const player = game.players[0];
    player.setTile(1, 1);
    player.invulnerable = 99;
    return { x: player.x, y: player.y };
  })()`);
  const beforeKeyMove = await evaluate("window.__BOMBMAN__.game.players[0].x");
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", code: "KeyD", key: "d", windowsVirtualKeyCode: 68 });
  await sleep(400);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", code: "KeyD", key: "d", windowsVirtualKeyCode: 68 });
  const afterKeyMove = await evaluate("window.__BOMBMAN__.game.players[0].x");
  expect(afterKeyMove > beforeKeyMove + 0.3, `rebound D key did not move player: ${beforeKeyMove} → ${afterKeyMove}`);
  await sleep(500);
  const gridState = await evaluate(`(() => {
    const player = window.__BOMBMAN__.game.players[0];
    return { x: player.x, y: player.y, col: player.col, row: player.row, moving: player.moving };
  })()`);
  expect(!gridState.moving, "player should stop after key release");
  expect(Math.abs(gridState.x - (gridState.col + 0.5)) < 1e-9, `player x is off-grid: ${JSON.stringify(gridState)}`);
  expect(Math.abs(gridState.y - (gridState.row + 0.5)) < 1e-9, `player y is off-grid: ${JSON.stringify(gridState)}`);
  console.log("rebound key moves player on grid:", { beforeKeyMove, afterKeyMove, gridState });

  // Exact regression: place a bomb under the player, then walk out of it.
  await evaluate(`(() => {
    const game = window.__BOMBMAN__.game;
    const player = game.players[0];
    game.bombs.length = 0;
    player.setTile(1, 1);
    player.invulnerable = 99;
    player.bombCooldown = 0;
    return { col: player.col, row: player.row };
  })()`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", code: "Space", key: " ", windowsVirtualKeyCode: 32 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", code: "Space", key: " ", windowsVirtualKeyCode: 32 });
  await sleep(150);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", code: "KeyD", key: "d", windowsVirtualKeyCode: 68 });
  await sleep(800);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", code: "KeyD", key: "d", windowsVirtualKeyCode: 68 });
  await sleep(300);
  const bombEscape = await evaluate(`(() => {
    const game = window.__BOMBMAN__.game;
    const player = game.players[0];
    return { col: player.col, row: player.row, x: player.x, bombs: game.bombs.length, alive: player.alive, hearts: player.hearts };
  })()`);
  expect(bombEscape.col > 1, `player stayed on the bomb cell: ${JSON.stringify(bombEscape)}`);
  expect(bombEscape.bombs >= 1, `bomb disappeared before testing: ${JSON.stringify(bombEscape)}`);
  expect(bombEscape.alive, `player died while stepping off the bomb: ${JSON.stringify(bombEscape)}`);
  console.log("escaped bomb on grid:", bombEscape);

  // Complete the level via the debug hook with a few upgrades, then verify that
  // the loadout is persisted for the next level.
  const beforeComplete = await evaluate(`(() => {
    const game = window.__BOMBMAN__.game;
    const player = game.players[0];
    for (const key of ["range", "bomb", "speed", "armor", "phoenix", "detonator"]) player.addPowerup(key);
    return { range: player.baseRange, bombs: player.baseBombs, speed: player.speedLevels, armor: player.armor, maxHearts: player.maxHearts, powers: [...player.powers] };
  })()`);
  await evaluate(`(() => {
    const app = window.__BOMBMAN__;
    const game = app.game;
    game.enemies.forEach((enemy) => { enemy.alive = false; enemy.dying = 0; });
    game.openPortal();
    game.players[0].invulnerable = 999;
    game.players[0].setTile(game.level.exit.col, game.level.exit.row);
    game.update(0.1);
    return game.state;
  })()`);
  await sleep(700);
  await screenshot("07c-level-complete.png");
  const savedLoadout = await evaluate("window.__BOMBMAN__.save.run.loadout");
  expect(savedLoadout?.baseRange === beforeComplete.range, `loadout range was not saved: ${JSON.stringify(savedLoadout)}`);
  expect(savedLoadout?.baseBombs === beforeComplete.bombs, "loadout bombs were not saved");
  expect(savedLoadout?.maxHearts === beforeComplete.maxHearts, "loadout max hearts were not saved");
  expect(savedLoadout?.powers?.includes("detonator"), "loadout powers were not saved");
  console.log("persistent loadout:", { beforeComplete, savedLoadout });
  await click("[data-result=menu]");
  await sleep(500);

  // Duel quick start via debug hook.
  await evaluate("window.BombManDebug.startVersus()");
  await sleep(700);
  await click("[data-intro-start]");
  await sleep(900);
  const versusState = await evaluate("window.__BOMBMAN__.game.state");
  const versusPlayers = await evaluate("window.__BOMBMAN__.game.players.length");
  expect(versusState === "playing", `versus should be playing, got ${versusState}`);
  expect(versusPlayers === 2, `versus should have 2 players, got ${versusPlayers}`);
  console.log("versus state:", versusState, "players:", versusPlayers);
  await screenshot("08-versus-desktop.png");
  await evaluate(`(() => {
    const game = window.__BOMBMAN__.game;
    game.players[1].alive = false;
    game.players[1].hearts = 0;
    game.update(0.1);
    return game.state;
  })()`);
  await sleep(700);
  await screenshot("08b-versus-result.png");

  // Mobile landscape home and game.
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 844,
    height: 390,
    deviceScaleFactor: 2,
    mobile: true
  });
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await navigate(`${BASE_URL}?mobile=1`);
  await sleep(400);
  await click("#bootPlay");
  await sleep(900);
  const mobileVersusHidden = await evaluate("document.getElementById('versusButton').hidden");
  expect(mobileVersusHidden, "versus button must be hidden on mobile");
  console.log("mobile versus hidden:", mobileVersusHidden);
  await screenshot("09-home-mobile.png");
  await evaluate("window.BombManDebug.startCampaign(3)");
  await sleep(600);
  await screenshot("10-intro-mobile.png");
  await evaluate("window.BombManDebug.finishIntro()");
  await sleep(1000);
  const carriedOnMobile = await evaluate(`(() => {
    const player = window.__BOMBMAN__.game.players[0];
    return { range: player.baseRange, bombs: player.baseBombs, speed: player.speedLevels, armor: player.armor, maxHearts: player.maxHearts, detonator: player.hasPower("detonator"), hearts: player.hearts };
  })()`);
  expect(carriedOnMobile.range >= beforeComplete.range, `carried range lost after reload: ${JSON.stringify(carriedOnMobile)}`);
  expect(carriedOnMobile.bombs >= beforeComplete.bombs, `carried bombs lost after reload: ${JSON.stringify(carriedOnMobile)}`);
  expect(carriedOnMobile.detonator, "detonator lost after reload");
  expect(carriedOnMobile.hearts === carriedOnMobile.maxHearts, "carried max hearts should start full");
  console.log("carried loadout after reload:", carriedOnMobile);
  await screenshot("11-game-mobile.png");
  console.log("mobile body classes:", await evaluate("document.body.className"));
  console.log("mobile fps:", await evaluate("window.__BOMBMAN__.fps"));
  const mobileLayout = await evaluate(`(() => {
    const frame = document.getElementById('arenaFrame').getBoundingClientRect();
    const joy = document.getElementById('joystickBase').getBoundingClientRect();
    const pad = document.getElementById('actionPad').getBoundingClientRect();
    const leftHud = document.getElementById('mobileHudLeft').getBoundingClientRect();
    const oldHud = document.querySelector('.game-hud');
    return {
      vw: innerWidth,
      vh: innerHeight,
      frame: { left: frame.left, right: frame.right, top: frame.top, bottom: frame.bottom },
      joy: { cx: joy.left + joy.width / 2, width: joy.width },
      pad: { cx: pad.left + pad.width / 2, width: pad.width },
      hud: { top: leftHud.top, display: getComputedStyle(document.getElementById('mobileHudLeft')).display },
      oldHudDisplay: getComputedStyle(oldHud).display
    };
  })()`);
  console.log("mobile layout:", mobileLayout);
  expect(Math.abs(mobileLayout.frame.left - (mobileLayout.vw - mobileLayout.frame.right)) <= 1, `arena side gaps are unequal: ${JSON.stringify(mobileLayout.frame)}`);
  expect(Math.abs(mobileLayout.frame.top) <= 1, `arena is not flush with the top: ${JSON.stringify(mobileLayout.frame)}`);
  expect(Math.abs(mobileLayout.frame.bottom - mobileLayout.vh) <= 1, `arena is not flush with the bottom: ${JSON.stringify(mobileLayout.frame)}`);
  expect(Math.abs(mobileLayout.joy.cx - mobileLayout.frame.left / 2) <= 2, `joystick is not centred in the left gap: ${JSON.stringify(mobileLayout)}`);
  expect(Math.abs(mobileLayout.pad.cx - (mobileLayout.frame.right + mobileLayout.vw) / 2) <= 2, `buttons are not centred in the right gap: ${JSON.stringify(mobileLayout)}`);
  expect(mobileLayout.hud.display !== "none" && mobileLayout.hud.top > 40, `mobile HUD is not below the phone status area: ${JSON.stringify(mobileLayout.hud)}`);
  expect(mobileLayout.oldHudDisplay === "none", "old top HUD must be hidden on mobile");

  // Touch joystick + action button.
  const rects = await evaluate(`(() => {
    const joy = document.getElementById('joystickBase').getBoundingClientRect();
    const bomb = document.querySelector('[data-game-btn=bomb]').getBoundingClientRect();
    return { joy: { x: joy.left + joy.width / 2, y: joy.top + joy.height / 2, w: joy.width }, bomb: { x: bomb.left + bomb.width / 2, y: bomb.top + bomb.height / 2 } };
  })()`);
  const beforeX = await evaluate("window.__BOMBMAN__.game.players[0].x");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: rects.joy.x, y: rects.joy.y, id: 1, radiusX: 6, radiusY: 6 }]
  });
  await sleep(100);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: rects.joy.x + rects.joy.w * 0.3, y: rects.joy.y, id: 1, radiusX: 6, radiusY: 6 }]
  });
  await sleep(500);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const afterX = await evaluate("window.__BOMBMAN__.game.players[0].x");
  expect(Math.abs(afterX - beforeX) > 0.2, `joystick did not move player: ${beforeX} → ${afterX}`);
  console.log("joystick moved player:", { beforeX, afterX });
  const bombsBefore = await evaluate("window.__BOMBMAN__.game.bombsPlaced");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: rects.bomb.x, y: rects.bomb.y, id: 2, radiusX: 6, radiusY: 6 }]
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(300);
  const bombsAfter = await evaluate("window.__BOMBMAN__.game.bombsPlaced");
  expect(bombsAfter === bombsBefore + 1, `touch bomb not placed: ${bombsBefore} → ${bombsAfter}`);
  console.log("touch bomb placed:", { bombsBefore, bombsAfter });
  await screenshot("11b-game-mobile-touch.png");

  // Portrait orientation prompt.
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await navigate(`${BASE_URL}?mobile=1`);
  await sleep(300);
  await click("#bootPlay");
  await sleep(700);
  const portraitPrompt = await evaluate("getComputedStyle(document.getElementById('rotate-overlay')).display !== 'none'");
  expect(portraitPrompt, "orientation prompt should be visible in portrait");
  console.log("portrait overlay visible:", portraitPrompt);
  await screenshot("12-portrait-prompt.png");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 844,
    height: 390,
    deviceScaleFactor: 2,
    mobile: true
  });
  await sleep(500);
  const landscapeHidden = await evaluate("getComputedStyle(document.getElementById('rotate-overlay')).display === 'none'");
  expect(landscapeHidden, "orientation prompt should hide after rotating to landscape");
  console.log("landscape overlay hidden:", landscapeHidden);
  await screenshot("13-landscape-after-rotate.png");

  console.log("CONSOLE_ERRORS", JSON.stringify(consoleErrors, null, 2));
  console.log("EXCEPTIONS", JSON.stringify(exceptions, null, 2));
  if (consoleErrors.length || exceptions.length) {
    throw new Error(`browser reported ${consoleErrors.length} console errors and ${exceptions.length} exceptions`);
  }
} catch (error) {
  console.error("SMOKE FAILED", error);
  console.log("CONSOLE_ERRORS", JSON.stringify(consoleErrors, null, 2));
  console.log("EXCEPTIONS", JSON.stringify(exceptions, null, 2));
  process.exitCode = 1;
} finally {
  clearInterval(eventTimer);
  cdp.close();
  chrome.kill();
  await sleep(500);
  try {
    rmSync(PROFILE, { recursive: true, force: true });
  } catch {
    /* Chrome can keep a lock briefly; the profile is git-ignored anyway. */
  }
}
