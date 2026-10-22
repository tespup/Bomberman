import {
  clamp,
  formatTime,
  formatScore,
  escapeHtml,
  withAlpha
} from "./core/utils.js";
import { saveManager, DEFAULT_KEYS, TOTAL_LEVELS } from "./core/storage.js";
import { telegram } from "./core/telegram.js";
import { audioEngine } from "./core/audio.js";
import { InputManager, keyLabel } from "./core/input.js";
import {
  ENEMY_LIST,
  POWERUP_LIST,
  POWERUPS,
  MOUNT_LIST,
  MOUNTS,
  POWERUP_UNLOCK_LEVEL
} from "./game/catalog.js";
import { createPalette } from "./game/palette.js";
import { Game } from "./game/game.js";
import { ArenaRenderer, MenuScene } from "./game/renderer.js";

const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21S3.5 16.2 3.5 9.6A4.9 4.9 0 0 1 12 6.1a4.9 4.9 0 0 1 8.5 3.5C20.5 16.2 12 21 12 21Z"/></svg>';
const LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>';
const STAR = "★";

const THEME_BOOT_PALETTE = createPalette(7);

// ---------------------------------------------------------------------------
// Telegram Bridge & Fullscreen (по аналогии с Tanks)
// ---------------------------------------------------------------------------
const isMobileClient = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function sendTgEvent(eventType, eventData) {
  const dataStr = eventData ? JSON.stringify(eventData) : '';
  try {
    if (window.TelegramWebviewProxy && window.TelegramWebviewProxy.postEvent) {
      window.TelegramWebviewProxy.postEvent(eventType, dataStr);
    } else if (window.external && window.external.invoke) {
      window.external.invoke(JSON.stringify({ eventType: eventType, eventData: eventData }));
    } else if (window.parent !== window) {
      window.parent.postMessage(JSON.stringify({ eventType: eventType, eventData: eventData }), '*');
    }
  } catch (e) {
    // Ошибки моста не должны ломать игру
  }
}

sendTgEvent('web_app_ready', null);
sendTgEvent('web_app_expand', null);
sendTgEvent('web_app_setup_swipe_behavior', { allow_vertical_swipe: false });

function enforceLandscape() {
  if (!isMobileClient) return;

  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }

  const isLandscape = window.innerWidth > window.innerHeight;
  if (isLandscape) {
    sendTgEvent('web_app_toggle_orientation_lock', { locked: true });
  } else {
    sendTgEvent('web_app_toggle_orientation_lock', { locked: false });
  }
}

window.addEventListener('resize', enforceLandscape);
window.addEventListener('orientationchange', () => {
  setTimeout(enforceLandscape, 50);
  setTimeout(enforceLandscape, 250);
});
enforceLandscape();

if (!isMobileClient) {
  sendTgEvent('web_app_exit_fullscreen', null);
  setTimeout(() => {
    sendTgEvent('web_app_exit_fullscreen', null);
  }, 150);
}

function requestFS() {
  if (!isMobileClient) return;

  sendTgEvent('web_app_expand', null);
  sendTgEvent('web_app_request_fullscreen', null);
  enforceLandscape();
}

if (isMobileClient) {
  requestFS();
  setTimeout(requestFS, 200);
}

const onceFS = () => {
  requestFS();
  document.removeEventListener('touchstart', onceFS);
  document.removeEventListener('click', onceFS);
};

document.addEventListener('touchstart', onceFS, { once: true, passive: true });
document.addEventListener('click', onceFS, { once: true });

class AmbientBackdrop {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.particles = [];
    this.time = 0;
    this.resize();
    this.#seed();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.#seed();
  }

  #seed() {
    const count = window.innerWidth < 800 ? 26 : 46;
    this.particles = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.7 + Math.random() * 2.1,
      vx: (Math.random() - 0.5) * 0.006,
      vy: -0.002 - Math.random() * 0.008,
      a: 0.06 + Math.random() * 0.26,
      phase: Math.random() * 6.28,
      color: Math.random() < 0.78 ? "mint" : "orange"
    }));
  }

  render(dt, time) {
    if (!this.width) return;
    this.time = time;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    // Sparse perspective grid.
    ctx.save();
    ctx.strokeStyle = "rgba(100, 229, 196, 0.035)";
    ctx.lineWidth = 1;
    const step = Math.max(48, Math.min(90, this.width / 19));
    for (let x = -step; x < this.width + step * 2; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + this.height * 0.25, this.height);
      ctx.stroke();
    }
    for (let y = 0; y < this.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y + this.width * 0.08);
      ctx.stroke();
    }
    ctx.restore();

    // Slow luminous blobs.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const blobs = [
      { x: 0.18, y: 0.16, r: 0.32, color: "rgba(76, 232, 189, .06)" },
      { x: 0.85, y: 0.22, r: 0.27, color: "rgba(255, 120, 72, .045)" },
      { x: 0.58, y: 0.9, r: 0.34, color: "rgba(92, 108, 235, .045)" }
    ];
    for (const blob of blobs) {
      const cx = (blob.x + Math.sin(time * 0.03 + blob.r * 10) * 0.02) * this.width;
      const cy = (blob.y + Math.cos(time * 0.025 + blob.x * 10) * 0.02) * this.height;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(this.width, this.height) * blob.r);
      gradient.addColorStop(0, blob.color);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    ctx.restore();

    // Distant embers / dust.
    ctx.save();
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.phase += dt * 0.7;
      if (particle.y < -0.03) {
        particle.y = 1.03;
        particle.x = Math.random();
      }
      if (particle.x < -0.03) particle.x = 1.03;
      if (particle.x > 1.03) particle.x = -0.03;
      const twinkle = 0.55 + Math.sin(particle.phase * 2.1) * 0.35;
      ctx.globalAlpha = particle.a * twinkle;
      ctx.fillStyle = particle.color === "mint" ? "#74f8cd" : "#ff9b68";
      ctx.beginPath();
      ctx.arc(particle.x * this.width, particle.y * this.height, particle.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

class BombManApp {
  constructor() {
    this.save = saveManager;
    this.settings = saveManager.settings;
    this.title = "BombMan";
    this.screen = "home";
    this.booted = false;
    this.pausedByOrientation = false;
    this.currentHud = null;
    this.activeModal = null;
    this.modalToken = 0;
    this.introTimers = [];
    this.introActive = false;
    this.introToken = 0;
    this.vsWins = { p1: 0, p2: 0 };
    this.vsRound = 1;
    this.frameTimes = [];
    this.fps = 60;
    this.globalTime = 0;
    this.lastTick = performance.now();
    this.lastFpsUpdate = 0;
    this.lastTimerUpdate = 0;
    this.lastResult = null;
    this._levelCardCache = new Map();
    this._bootAnim = null;

    const params = new URLSearchParams(window.location.search);
    telegram.applyOverrides({
      mobile: params.get("mobile") === "1",
      desktop: params.get("desktop") === "1"
    });
    this.isMobile = telegram.isMobile;
    this.isTouch = telegram.isTouch;
    this.isDesktop = telegram.isDesktop;
    this.debugAutostart = params.get("autostart") === "1";
    this.debugLevel = Number(params.get("level")) || 1;

    telegram.init();
    document.body.classList.toggle("is-mobile", this.isMobile);
    document.body.classList.toggle("is-desktop", this.isDesktop);
    document.body.classList.toggle("is-touch", this.isTouch);
    document.body.classList.add("is-loading");

    this.input = new InputManager(this.settings.keys);
    this.input.attach();
    this.audio = audioEngine;
    this.audio.setSettings(this.settings);

    this.ambient = new AmbientBackdrop(document.getElementById("ambientCanvas"));
    this.menuScene = new MenuScene(document.getElementById("heroCanvas"));
    this.menuScene.setPalette(THEME_BOOT_PALETTE);
    this.menuScene.attachResizeObserver();

    this.renderer = new ArenaRenderer(document.getElementById("gameCanvas"));
    this.renderer.setQuality(this.settings.particles);
    this.renderer.attachResizeObserver(document.getElementById("arenaFrame"));

    this.game = new Game({
      input: this.input,
      audio: this.audio,
      particleQuality: this.settings.particles,
      callbacks: {
        onHud: (hud) => this.applyHud(hud),
        onLevelComplete: (result) => this.onLevelComplete(result),
        onGameOver: (result) => this.onGameOver(result),
        onVersusRoundEnd: (result) => this.onVersusRoundEnd(result),
        onToast: (payload) => this.onGameToast(payload),
        onGameStarted: () => this.#onGameStarted()
      }
    });
    this.game.shakeEnabled = this.settings.screenShake;

    this.#cacheDom();
    this.#bindCoreEvents();
    this.#bindTouchControls();
    this.#applySettingsClasses();
    this.#updateMenu(true);
    this.#buildLevelGrid();
    this.#renderKeyHints();
    this.#setScreen("home", { skipInput: true });
    this.#updateBootUi();
    this.#updateOrientation();

    this.renderer.onResize = () => this.#fitArena();

    window.addEventListener("resize", () => this.#onResize(), { passive: true });
    window.addEventListener("orientationchange", () => this.#onResize());
    window.addEventListener("bombman:orientation", () => this.#updateOrientation(), { passive: true });
    document.addEventListener("visibilitychange", () => this.#onVisibilityChange());
    window.addEventListener("bombman:resize", () => this.#onResize());
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => this.#onResize()).catch(() => {});
    }

    this.input.onCommand = (command) => this.#handleCommand(command);
    this.input.onPause = () => this.#handleEscape();

    this.telegramBack = () => this.#handleTelegramBack();
    telegram.setBackButton(null);

    requestAnimationFrame((timestamp) => this.#loop(timestamp));

    window.__BOMBMAN__ = this;
    this.#initTelegramUser();
    window.addEventListener("error", (event) => {
      console.error("[BombMan]", event.error || event.message);
    });

    if (this.debugAutostart) {
      setTimeout(() => {
        this.#boot();
        setTimeout(() => this.startCampaign(this.debugLevel), 100);
      }, 120);
    }
  }

  #cacheDom() {
    this.dom = {
      bootSplash: document.getElementById("bootSplash"),
      bootPlay: document.getElementById("bootPlay"),
      bootSound: document.getElementById("bootSound"),
      orientation: document.getElementById("rotate-overlay"),
      campaignSubtitle: document.getElementById("campaignSubtitle"),
      versusButton: document.getElementById("versusButton"),
      playerName: document.getElementById("playerName"),
      playerAvatar: document.getElementById("playerAvatar"),
      playerPill: document.getElementById("playerPill"),
      progressLabel: document.getElementById("progressLabel"),
      progressBar: document.getElementById("progressBar"),
      totalScore: document.getElementById("totalScore"),
      totalStars: document.getElementById("totalStars"),
      bestLevel: document.getElementById("bestLevel"),
      heroCaption: document.getElementById("heroCaption"),
      levelsUnlocked: document.getElementById("levelsUnlocked"),
      levelGrid: document.getElementById("levelGrid"),
      levelsFooterText: document.getElementById("levelsFooterText"),
      hudKicker: document.getElementById("hudKicker"),
      hudLevelName: document.getElementById("hudLevelName"),
      hudTimer: document.getElementById("hudTimer"),
      hudEnemies: document.getElementById("hudEnemies"),
      hudRound: document.getElementById("hudRound"),
      hudHearts: document.getElementById("hudHearts"),
      hudScore: document.getElementById("hudScore"),
      hudObjectiveLabel: document.getElementById("hudObjectiveLabel"),
      objectiveText: document.getElementById("objectiveText"),
      objectivePill: document.getElementById("objectivePill"),
      powerStrip: document.getElementById("powerStrip"),
      contextHint: document.getElementById("contextHint"),
      gameToastLayer: document.getElementById("gameToastLayer"),
      modalRoot: document.getElementById("modalRoot"),
      toastRoot: document.getElementById("toastRoot"),
      actionLabel: document.getElementById("actionLabel"),
      actionPad: document.getElementById("actionPad"),
      joystickBase: document.getElementById("joystickBase"),
      joystickKnob: document.getElementById("joystickKnob"),
      arenaLayout: document.querySelector(".arena-layout"),
      arenaShell: document.getElementById("arenaShell"),
      arenaFrame: document.getElementById("arenaFrame"),
      gameCanvas: document.getElementById("gameCanvas"),
      mobileHudLeft: document.getElementById("mobileHudLeft"),
      mobileHudRight: document.getElementById("mobileHudRight"),
      mhKicker: document.getElementById("mhKicker"),
      mhLevelName: document.getElementById("mhLevelName"),
      mhTimer: document.getElementById("mhTimer"),
      mhEnemies: document.getElementById("mhEnemies"),
      mhHearts: document.getElementById("mhHearts"),
      mhScore: document.getElementById("mhScore"),
      fpsLabel: document.getElementById("fpsLabel"),
      gameFooterHint: document.getElementById("gameFooterHint"),
      p1Equipped: document.getElementById("p1Equipped"),
      p2Equipped: document.getElementById("p2Equipped"),
      p1Vitals: document.getElementById("p1Vitals"),
      p2Vitals: document.getElementById("p2Vitals"),
      desktopP2: document.getElementById("desktopP2"),
      desktopSoloNote: document.getElementById("desktopSoloNote")
    };
  }

  #bindCoreEvents() {
    this.dom.bootPlay.addEventListener("click", () => this.#boot());
    this.dom.bootSound.addEventListener("click", () => {
      const enable = !(this.settings.music || this.settings.sfx);
      this.settings.music = enable;
      this.settings.sfx = enable;
      this.save.updateSettings({ music: enable, sfx: enable });
      this.audio.setSettings(this.settings);
      this.#updateBootUi();
      this.#updateSoundUi();
      this.#toast(enable ? "Звук включён" : "Звук выключен");
    });

    document.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest("button");
        if (!button || button.closest("[data-game-btn]") || button.id === "bootPlay") return;
        if (!this.booted) return;
        this.audio.play("click", { volume: 0.28, throttle: 0.035 });
        if (this.isTouch) telegram.haptic("selection");
      },
      true
    );

    document.addEventListener("click", (event) => {
      const actionTarget = event.target.closest("[data-action]");
      if (actionTarget) {
        const action = actionTarget.dataset.action;
        this.#handleAction(action, actionTarget, event);
        return;
      }
      const levelTarget = event.target.closest("[data-level]");
      if (levelTarget) {
        this.#onLevelCardClick(levelTarget);
      }
    });

    this.dom.modalRoot.addEventListener("click", (event) => {
      if (event.target.matches("[data-modal-backdrop]")) {
        if (this.activeModal?.dismissible) this.closeModal();
        return;
      }
      const closeButton = event.target.closest("[data-modal-close]");
      if (closeButton) {
        this.closeModal();
      }
    });

    this.input.bindJoystick(this.dom.joystickBase, this.dom.joystickKnob);
  }

  #bindTouchControls() {
    const buttons = document.querySelectorAll("[data-game-btn]");
    buttons.forEach((button) => {
      const activate = (event) => {
        if (event) event.preventDefault();
        requestFS();
        if (this.screen !== "game") return;
        const type = button.dataset.gameBtn;
        button.classList.add("is-pressed");
        setTimeout(() => button.classList.remove("is-pressed"), 100);
        if (type === "pause") {
          this.togglePause();
          telegram.haptic("impact", "light");
          return;
        }
        if (this.game.state !== "playing") return;
        this.game.command({ type, player: 0, source: "touch" });
        telegram.haptic("impact", type === "bomb" ? "medium" : "light");
      };
      button.addEventListener("pointerdown", activate, { passive: false });
      button.addEventListener("click", (event) => {
        if (event.detail === 0) activate(event);
      });
    });
  }

  async #boot() {
    if (this.booted) return;
    this.booted = true;
    requestFS();
    document.body.classList.remove("is-loading");
    document.body.classList.add("booted");
    this.dom.bootSplash.setAttribute("aria-hidden", "true");
    await this.audio.unlock();
    this.audio.setSettings(this.settings);
    if (this.settings.music) this.audio.startMusic("menu");
    this.#updateSoundUi();
    requestFS();
    setTimeout(() => {
      this.#updateOrientation();
      this.#onResize();
    }, 160);
  }

  #updateBootUi() {
    const enabled = Boolean(this.settings.music || this.settings.sfx);
    this.dom.bootSound.classList.toggle("is-active", enabled);
    this.dom.bootSound.innerHTML = `<span class="toggle-led"></span>${enabled ? "Звук включён" : "Звук выключен"}`;
  }

  #loop(timestamp) {
    const dt = Math.min(0.05, Math.max(0, (timestamp - this.lastTick) / 1000));
    this.lastTick = timestamp;
    this.globalTime += dt;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 90) this.frameTimes.shift();

    if (this.screen !== "game") {
      this.ambient.render(dt, this.globalTime);
    }
    if (this.screen === "home") {
      this.menuScene.render(this.globalTime);
    }

    if (this.screen === "game" && this.game.level) {
      this.game.update(dt);
      this.renderer.render(this.game, this.globalTime, dt);
      this.#updateLiveHud(timestamp);
    }

    if (timestamp - this.lastFpsUpdate > 500) {
      const avg = this.frameTimes.reduce((sum, value) => sum + value, 0) / Math.max(1, this.frameTimes.length);
      this.fps = Math.round(1 / Math.max(0.001, avg));
      this.lastFpsUpdate = timestamp;
      if (this.settings.showFps) this.dom.fpsLabel.textContent = `${this.fps} FPS`;
      else this.dom.fpsLabel.textContent = "LIVE";
    }

    requestAnimationFrame((next) => this.#loop(next));
  }

  #onResize() {
    this.ambient.resize();
    this.menuScene.resize();
    this.#fitArena();
    this.#updateOrientation();
  }

  #fitArena() {
    if (this.screen !== "game" || !this.dom.arenaShell) return;
    const ratio = 15 / 13;
    let width;
    let height;
    if (this.isMobile) {
      // Full-bleed phone layout. The side columns are equal flex items, so the
      // stick and buttons are centred in the exact gaps around the arena.
      const layout = this.dom.arenaLayout;
      const fullW = layout?.clientWidth || window.innerWidth;
      const fullH = layout?.clientHeight || window.innerHeight;
      height = fullH;
      width = height * ratio;
      const requiredSide = Math.max(118, Math.min(178, fullW * 0.17));
      const maxWidth = fullW - requiredSide * 2;
      if (width > maxWidth) {
        width = maxWidth;
        height = width / ratio;
      }
    } else {
      const shell = this.dom.arenaShell;
      const availableW = Math.max(80, shell.clientWidth - 4);
      const availableH = Math.max(80, shell.clientHeight - 4);
      width = availableW;
      height = width / ratio;
      if (height > availableH) {
        height = availableH;
        width = height * ratio;
      }
    }
    width = Math.max(120, Math.floor(width));
    height = Math.max(100, Math.floor(height));
    this.dom.arenaFrame.style.width = `${width}px`;
    this.dom.arenaFrame.style.height = `${height}px`;
    this.renderer.resize();
  }

  // -------------------------------------------------------------------------
  // Navigation & actions
  // -------------------------------------------------------------------------

  #setScreen(screen, { skipInput = false } = {}) {
    this.screen = screen;
    document.body.dataset.screen = screen;
    document.querySelectorAll(".screen").forEach((element) => {
      element.classList.toggle("is-active", element.id === `screen-${screen}`);
    });
    if (!skipInput) {
      this.input.setEnabled(screen === "game" && this.game.state === "playing");
    }
    if (screen !== "game") {
      this.renderer.levelSeed = null;
    }
    this.#updateTelegramBack();
  }

  #updateTelegramBack() {
    if (this.screen === "home") telegram.setBackButton(null);
    else telegram.setBackButton(() => this.#handleTelegramBack());
  }

  #handleTelegramBack() {
    this.#handleEscape();
  }

  #handleAction(action, target, event) {
    if (event) event.preventDefault();
    requestFS();
    switch (action) {
      case "campaign":
        this.#startCampaignFromMenu();
        break;
      case "versus":
        this.startVersusMatch();
        break;
      case "levels":
        this.openLevels();
        break;
      case "guide":
        this.openCodex();
        break;
      case "settings":
        this.openSettings(false);
        break;
      case "quick-sound":
        this.quickToggleSound();
        break;
      case "home":
        this.#goHome();
        break;
      case "pause":
        this.openPause();
        break;
      case "reset-progress":
        this.#confirmResetProgress();
        break;
      default:
        break;
    }
  }

  #handleEscape() {
    if (!this.booted) return;
    if (this.activeModal) {
      if (this.activeModal.type === "intro") {
        this.finishIntro();
        return;
      }
      if (["result", "gameover", "versus-result"].includes(this.activeModal.type)) {
        return;
      }
      this.closeModal();
      return;
    }
    if (this.screen === "game") {
      if (this.game.state === "playing") this.openPause();
      else if (this.game.state === "paused") this.resumeGame();
      return;
    }
    if (this.screen === "levels") this.#goHome();
  }

  #handleCommand(command) {
    if (this.screen !== "game" || this.game.state !== "playing") return;
    this.game.command(command);
  }

  #startCampaignFromMenu() {
    requestFS();
    const isPortrait = window.innerWidth < window.innerHeight;
    if ((this.isMobile || isMobileClient) && isPortrait) {
      this.#updateOrientation();
      return;
    }
    const level = clamp(this.save.progress.unlocked, 1, TOTAL_LEVELS);
    this.startCampaign(level, { loadout: this.save.run?.loadout || null });
  }

  openLevels() {
    this.#closeModalSilent();
    this.#buildLevelGrid();
    this.#setScreen("levels");
    this.input.setEnabled(false);
    this.#updateTelegramBack();
  }

  #goHome() {
    this.#clearIntroTimers();
    this.#closeModalSilent();
    this.pausedByOrientation = false;
    if (this.game.state !== "idle") this.game.stop();
    this.input.setEnabled(false);
    document.body.classList.remove("is-versus");
    this.#setScreen("home");
    this.#updateMenu();
    this.#updateProgressUI();
    this.#updateSoundUi();
    telegram.setClosingConfirmation(false);
    if (this.settings.music) this.audio.startMusic("menu");
  }

  #onLevelCardClick(target) {
    const level = Number(target.dataset.level);
    if (!level || target.disabled || target.classList.contains("locked")) return;
    if (!this.save.isLevelUnlocked(level)) return;
    requestFS();
    this.startCampaign(level, { loadout: this.save.run?.loadout || null });
  }

  // -------------------------------------------------------------------------
  // Campaign & versus
  // -------------------------------------------------------------------------

  startCampaign(levelNumber, options = {}) {
    requestFS();
    const isPortrait = window.innerWidth < window.innerHeight;
    if ((this.isMobile || isMobileClient) && isPortrait) {
      this.#updateOrientation();
      this.#toast("Поверните телефон горизонтально");
      return;
    }
    this.#clearIntroTimers();
    this.#closeModalSilent();
    this.audio.unlock();
    this.audio.setSettings(this.settings);
    document.body.classList.remove("is-versus");
    document.body.classList.add("is-campaign");
    this.#setScreen("game");
    const savedLoadout = this.save.run?.loadout || null;
    const level = this.game.prepareCampaign(levelNumber, {
      loadout: options.loadout === undefined ? savedLoadout : options.loadout
    });
    this.game.setParticleQuality(this.settings.particles);
    this.game.shakeEnabled = this.settings.screenShake;
    this.renderer.setQuality(this.settings.particles);
    this.input.setEnabled(false);
    this.#prepareVersusUi(false);
    this.#updateHudShellForLevel(level);
    this.#renderKeyHints();
    requestAnimationFrame(() => this.#fitArena());
    this.#showLevelIntro(level, "campaign");
    telegram.setClosingConfirmation(true);
    if (!this.save.data.flags.introSeen) this.save.markTutorialSeen();
  }

  startVersusMatch() {
    if (this.isMobile) {
      this.#toast("Дуэль доступна только на компьютере");
      return;
    }
    this.vsWins = { p1: 0, p2: 0 };
    this.vsRound = 1;
    this.startVersusRound(1);
  }

  startVersusRound(round) {
    if (this.isMobile) return;
    this.#clearIntroTimers();
    this.#closeModalSilent();
    this.audio.unlock();
    this.audio.setSettings(this.settings);
    document.body.classList.add("is-versus");
    document.body.classList.remove("is-campaign");
    this.#setScreen("game");
    this.vsRound = round;
    const level = this.game.prepareVersus(round, this.vsWins);
    this.game.versusScore = { ...this.vsWins };
    this.game.setParticleQuality(this.settings.particles);
    this.game.shakeEnabled = this.settings.screenShake;
    this.renderer.setQuality(this.settings.particles);
    this.input.setEnabled(false);
    this.#prepareVersusUi(true);
    this.#updateHudShellForLevel(level);
    this.#renderKeyHints();
    requestAnimationFrame(() => this.#fitArena());
    this.#showLevelIntro(level, "versus");
    telegram.setClosingConfirmation(true);
  }

  #prepareVersusUi(isVersus) {
    document.body.classList.toggle("is-versus", isVersus);
    this.dom.desktopP2.hidden = !isVersus;
    this.dom.desktopSoloNote.hidden = isVersus;
    this.dom.hudObjectiveLabel.textContent = isVersus ? "СОПЕРНИК" : "ВРАГИ";
  }

  #updateHudShellForLevel(level) {
    const versus = this.game.mode === "versus";
    this.dom.hudKicker.textContent = versus ? `ДУЭЛЬ · РАУНД ${this.game.round}` : `УРОВЕНЬ ${String(level.number).padStart(2, "0")}`;
    this.dom.hudLevelName.textContent = level.name;
    this.dom.hudTimer.textContent = "00:00";
    this.dom.hudScore.textContent = "0";
    this.dom.hudEnemies.textContent = versus ? "1" : String(level.enemies.length);
    this.dom.hudRound.textContent = `${this.game.round} · ${this.vsWins.p1}:${this.vsWins.p2}`;
    if (this.dom.mhKicker) {
      this.dom.mhKicker.textContent = versus ? `ДУЭЛЬ · РАУНД ${this.game.round}` : `УРОВЕНЬ ${String(level.number).padStart(2, "0")}`;
      this.dom.mhLevelName.textContent = level.name;
      this.dom.mhTimer.textContent = "00:00";
      this.dom.mhScore.textContent = "0";
      this.dom.mhEnemies.textContent = versus ? "1" : String(level.enemies.length);
    }
    this.dom.objectivePill.classList.remove("is-hidden");
    this.dom.objectiveText.textContent = versus ? "Уничтожьте соперника" : "Уничтожьте всех врагов";
    this.dom.powerStrip.innerHTML = "";
    this.dom.p1Equipped.innerHTML = "";
    this.dom.p2Equipped.innerHTML = "";
    this.dom.gameToastLayer.innerHTML = "";
    const palette = level.palette;
    this.dom.arenaFrame.style.setProperty("--arena-accent", palette.accent);
  }

  #showLevelIntro(level, mode) {
    this.#clearIntroTimers();
    this.introActive = true;
    const token = ++this.introToken;
    const versus = mode === "versus";
    const roster = versus
      ? [
          { name: "Игрок 1", glyph: "P1", color: level.palette.accent },
          { name: "Игрок 2", glyph: "P2", color: level.palette.accent2 }
        ]
      : level.enemies
          .map((enemy) => ENEMY_LIST.find((definition) => definition.key === enemy.type))
          .filter(Boolean)
          .filter((enemy, index, list) => list.findIndex((item) => item.key === enemy.key) === index);
    const enemyChips = roster
      .slice(0, 5)
      .map(
        (enemy) =>
          `<span class="intro-enemy-chip"><i style="background:${enemy.color}"></i>${escapeHtml(enemy.name)}</span>`
      )
      .join("");
    const mountChip = level.mountEgg
      ? `<span class="intro-enemy-chip"><i style="background:${MOUNTS[level.mountEgg.type]?.color || level.palette.accent}"></i>Животное: ${escapeHtml(MOUNTS[level.mountEgg.type]?.name || "Яйцо")}</span>`
      : "";
    const description = versus
      ? "Локальная дуэль на одном экране. Собирайте бонусы, взрывайте блоки и уничтожьте соперника. Побеждает первый, кто возьмёт два раунда."
      : level.description;
    const html = `
      <div class="modal-panel level-intro-panel" role="dialog" aria-modal="true" aria-label="Начало уровня" style="--intro-accent:${level.palette.accent};--intro-glow:${withAlpha(level.palette.accent, 0.22)}">
        <div class="level-intro-bg">
          <button class="modal-close" data-intro-start aria-label="Начать сразу" title="Начать сразу">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div class="intro-level-number"><b>${versus ? "VS" : String(level.number).padStart(2, "0")}</b><span>/ ${versus ? `раунд ${this.game.round}` : "50"}</span></div>
          <h2 class="intro-world-name">${escapeHtml(versus ? level.name : level.name)}</h2>
          <p class="intro-desc">${escapeHtml(description)}</p>
          ${versus ? "" : this.#carriedGearMarkup()}
          <div class="intro-enemies">${enemyChips}${mountChip}</div>
          <div class="intro-ready">
            <div class="countdown">
              <svg viewBox="0 0 52 52"><circle class="ring-bg" cx="26" cy="26" r="24"></circle><circle class="ring-fg" cx="26" cy="26" r="24"></circle></svg>
              <b data-intro-count>3</b>
            </div>
            <div class="intro-ready-copy"><b>Приготовьтесь</b><span>${versus ? "Дуэль на клавиатуре" : "Арена генерируется"}</span></div>
          </div>
        </div>
        <div style="padding:0 22px 20px">
          <button class="btn btn-primary" data-intro-start style="width:100%">${versus ? "Начать дуэль" : "Войти на арену"}</button>
        </div>
      </div>`;
    this.openModal(html, {
      type: "intro",
      dismissible: false,
      onClose: () => {
        if (token === this.introToken && this.introActive) this.#beginAfterIntro();
      }
    });
    const panel = this.dom.modalRoot.querySelector(".modal-panel");
    panel?.querySelectorAll("[data-intro-start]").forEach((button) => {
      button.addEventListener("click", () => this.finishIntro());
    });

    let count = 3;
    const countEl = this.dom.modalRoot.querySelector("[data-intro-count]");
    this.introTimers.push(
      setInterval(() => {
        count -= 1;
        if (countEl) countEl.textContent = String(Math.max(1, count));
        if (count > 0) {
          this.audio.play("countdown", { volume: 0.45 });
          if (this.isTouch) telegram.haptic("selection");
        }
      }, 900)
    );
    this.introTimers.push(
      setTimeout(() => {
        if (token === this.introToken) this.finishIntro();
      }, 2900)
    );
  }

  #carriedGearMarkup() {
    const player = this.game.players[0];
    if (!player) return "";
    const parts = [];
    if (player.baseBombs > 1) parts.push(`бомб ×${player.baseBombs}`);
    if (player.range > 1) parts.push(`радиус ${player.range}`);
    if (player.speedLevels > 0) parts.push("скорость");
    if (player.armor > 0) parts.push(`броня ${player.armor}`);
    if (player.maxHearts > 3) parts.push(`+${player.maxHearts - 3} сердца`);
    const powerCount = player.powers.size;
    if (powerCount > 0) parts.push(`бонусов ${powerCount}`);
    if (player.mount) parts.push(MOUNTS[player.mount.key]?.name || "питомец");
    if (!parts.length) return "";
    return `<div class="intro-carry"><span>СНАРЯЖЕНИЕ СОХРАНЕНО</span><b>${escapeHtml(parts.join(" · "))}</b></div>`;
  }

  finishIntro() {
    if (!this.introActive) return;
    this.#beginAfterIntro();
  }

  #beginAfterIntro() {
    if (!this.introActive) return;
    this.introActive = false;
    this.introToken += 1;
    this.#clearIntroTimers();
    this.closeModal({ silent: true });
    if (this.game.state === "intro") this.game.begin();
    this.input.setEnabled(true);
    this.#setScreen("game", { skipInput: false });
    this.#fitArena();
    this.#toastGame("Поехали!", this.game.level.palette.accent, "Старт");
    this.#updateOrientation();
  }

  #clearIntroTimers() {
    for (const timer of this.introTimers) {
      clearInterval(timer);
      clearTimeout(timer);
    }
    this.introTimers = [];
    this.introActive = false;
    this.introToken += 1;
  }

  #onGameStarted() {
    this.input.setEnabled(true);
    this.dom.gameCanvas.focus?.();
    this.#fitArena();
  }

  openPause() {
    if (this.screen !== "game" || !this.game.level) return;
    if (this.game.state !== "playing" && this.game.state !== "paused") return;
    this.game.setPaused(true);
    this.input.setEnabled(false);
    const player = this.game.players[0];
    const html = `
      <div class="modal-panel is-narrow" role="dialog" aria-modal="true" aria-label="Пауза">
        <div class="modal-head">
          <div class="modal-head-copy"><span class="eyebrow">ИГРА НА ПАУЗЕ</span><h2 class="modal-title">Вдох перед взрывом</h2></div>
          <button class="modal-close" data-modal-close aria-label="Продолжить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="modal-body">
          <div class="pause-hero">
            <div class="pause-level"><span>${this.game.mode === "versus" ? `ДУЭЛЬ · РАУНД ${this.game.round}` : `УРОВЕНЬ ${String(this.game.levelNumber).padStart(2, "0")}`}</span><b>${escapeHtml(this.game.level.name)}</b></div>
            <div class="pause-meta">
              <span>ВРЕМЯ<b>${this.dom.hudTimer.textContent}</b></span>
              <span>ОЧКИ<b>${formatScore(this.game.score)}</b></span>
            </div>
          </div>
          <div class="pause-status">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>
            <span>${this.game.mode === "versus" ? `Счёт матча: ${this.vsWins.p1} : ${this.vsWins.p2}` : `Уничтожено врагов: ${this.game.kills} · Сердца: ${player?.hearts ?? 0}/${player?.maxHearts ?? 0}`}</span>
          </div>
          <div class="modal-actions">
            <button class="btn btn-primary" data-pause="resume"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Продолжить</button>
            <div class="modal-actions-row">
              <button class="btn" data-pause="settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4 16.9l.2-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.7v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4 6.9 6.9 4l.1.1A1.7 1.7 0 0 0 8.9 4a1.7 1.7 0 0 0 1-1.6v-.2h4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.9 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4h-.1a1.7 1.7 0 0 0-1.7 1Z"/></svg>Настройки</button>
              <button class="btn" data-pause="restart"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>Заново</button>
            </div>
            <button class="btn btn-subtle" data-pause="menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>Выйти в главное меню</button>
          </div>
        </div>
      </div>`;
    this.openModal(html, {
      type: "pause",
      dismissible: true,
      onClose: () => {
        if (this.game.state === "paused" && !this.activeModal) this.resumeGame();
      }
    });
    const panel = this.dom.modalRoot.querySelector(".modal-panel");
    panel?.querySelectorAll("[data-pause]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.pause;
        if (action === "resume") {
          this.#closeModalSilent();
          this.resumeGame();
        } else if (action === "settings") {
          this.openSettings(true);
        } else if (action === "restart") {
          this.#closeModalSilent();
          this.game.restartLevel();
          this.input.setEnabled(true);
          this.#fitArena();
          this.#toast("Уровень перезапущен");
        } else if (action === "menu") {
          this.#confirmExitToMenu();
        }
      });
    });
  }

  resumeGame() {
    if (this.game.state !== "paused") return;
    this.#closeModalSilent();
    this.game.setPaused(false);
    this.input.setEnabled(true);
    this.audio.setPaused(false);
    if (this.settings.music) {
      this.audio.startMusic("game", {
        seed: this.game.level.music.seed,
        tempo: this.game.level.music.tempo,
        root: this.game.level.music.root,
        mode: this.game.level.music.mode
      });
    }
    this.#fitArena();
  }

  togglePause() {
    if (this.screen !== "game") return;
    if (this.activeModal?.type === "pause") this.resumeGame();
    else if (this.game.state === "playing") this.openPause();
    else if (this.game.state === "paused") this.resumeGame();
  }

  #confirmExitToMenu() {
    this.#confirmDialog(
      "Выйти в меню?",
      "Текущий уровень будет прерван. Прогресс пройденных уровней сохранится.",
      "Выйти",
      () => {
        this.#goHome();
      },
      true
    );
  }

  #confirmResetProgress() {
    this.#confirmDialog(
      "Сбросить прогресс?",
      "Откроются только уровни с первого, а все звёзды и рекорды кампании будут удалены. Настройки сохранятся.",
      "Сбросить",
      () => {
        this.save.resetProgress();
        this.settings = this.save.settings;
        this.#updateProgressUI();
        this.#updateMenu(true);
        this.#buildLevelGrid();
        this.#toast("Прогресс сброшен");
        this.openLevels();
      },
      true
    );
  }

  // -------------------------------------------------------------------------
  // Results
  // -------------------------------------------------------------------------

  onLevelComplete(result) {
    this.input.setEnabled(false);
    this.lastResult = result;
    const isFinal = result.level >= TOTAL_LEVELS;
    if (result.loadout) this.save.setRunLoadout(result.loadout);
    const record = this.save.recordLevelResult(result.level, {
      score: result.score,
      time: result.time,
      stars: result.stars,
      kills: result.kills,
      bombs: result.bombs
    });
    this.#updateProgressUI();
    this.#updateMenu(true);
    const stars = [0, 1, 2].map((index) => `<span class="${index < result.stars ? "" : "dim"}">${STAR}</span>`).join("");
    const title = isFinal ? "КАМПАНИЯ<br><em>ПРОЙДЕНА</em>" : "УРОВЕНЬ<br><em>ОЧИЩЕН</em>";
    const subtitle = isFinal
      ? "Все 50 миров взорваны позади. Вы дошли до конца процедурной кампании BombMan."
      : `Мир «${escapeHtml(this.game.level.name)}» покорён. ${record.isNewBest ? "Новый личный рекорд!" : "Впереди ещё один сгенерированный мир."} Снаряжение перенесено в следующий уровень.`;
    const nextLevel = Math.min(TOTAL_LEVELS, result.level + 1);
    const actions = isFinal
      ? `<button class="btn btn-primary" data-result="menu">В главное меню</button>
         <div class="result-actions-row"><button class="btn" data-result="share">Поделиться</button><button class="btn" data-result="replay">Пройти 50-й снова</button></div>`
      : `<button class="btn btn-primary" data-result="next">Следующий уровень <span style="opacity:.55">→</span></button>
         <div class="result-actions-row"><button class="btn" data-result="replay">Заново</button><button class="btn" data-result="menu">В меню</button></div>`;
    const html = `
      <div class="modal-panel result-panel" role="dialog" aria-modal="true" aria-label="Уровень пройден">
        <div class="result-glow"></div>
        ${isFinal ? this.#confettiMarkup() : ""}
        <div class="result-content">
          <div class="result-kicker">${isFinal ? "50 / 50 · ЗАВЕРШЕНО" : `УРОВЕНЬ ${String(result.level).padStart(2, "0")} · ПОБЕДА`}</div>
          <h2 class="result-title">${title}</h2>
          <p class="result-subtitle">${subtitle}</p>
          <div class="result-stars">${stars}</div>
          <div class="result-stats">
            <div class="result-stat"><span>ОЧКИ</span><b class="accent">${formatScore(result.score)}</b></div>
            <div class="result-stat"><span>ВРЕМЯ</span><b>${formatTime(result.time)}</b></div>
            <div class="result-stat"><span>БОНУС</span><b>+${formatScore(result.timeBonus)}</b></div>
          </div>
          <div class="modal-text" style="margin:-7px 0 15px">Врагов уничтожено: <strong>${result.kills}</strong> · блоков: <strong>${result.blocks}</strong> · бонусов: <strong>${result.pickups}</strong></div>
          <div class="result-actions">${actions}</div>
        </div>
      </div>`;
    this.openModal(html, {
      type: "result",
      dismissible: false
    });
    const panel = document.querySelector("#modalRoot .modal-panel");
    panel?.querySelectorAll("[data-result]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.result;
        if (action === "next") {
          this.#closeModalSilent();
          this.startCampaign(nextLevel, { loadout: result.loadout });
        } else if (action === "replay") {
          this.#closeModalSilent();
          this.startCampaign(result.level, { loadout: result.loadout });
        } else if (action === "menu") {
          this.#goHome();
        } else if (action === "share") {
          telegram.share(
            `Я прошёл кампанию BombMan — 50 процедурных миров! Итоговый счёт: ${formatScore(result.score)}.`,
            window.location.href
          );
        }
      });
    });
    if (isFinal) this.audio.play("victory", { volume: 1 });
  }

  onGameOver(result) {
    this.input.setEnabled(false);
    this.audio.stopMusic(0.2);
    const html = `
      <div class="modal-panel result-panel is-narrow" role="dialog" aria-modal="true" aria-label="Игра окончена">
        <div class="result-glow" style="background:radial-gradient(circle,rgba(255,84,104,.16),transparent 66%)"></div>
        <div class="result-content">
          <div class="result-kicker" style="color:var(--danger)">СИГНАЛ ПОТЕРЯН</div>
          <h2 class="result-title">ИГРА<br><em style="color:var(--danger)">ОКОНЧЕНА</em></h2>
          <p class="result-subtitle">Уровень ${result.level} оказался сильнее. Арена уже ждёт следующую попытку — она не осудит.</p>
          <div class="result-stats">
            <div class="result-stat"><span>ОЧКИ</span><b>${formatScore(result.score)}</b></div>
            <div class="result-stat"><span>ВРЕМЯ</span><b>${formatTime(result.time)}</b></div>
            <div class="result-stat"><span>ВРАГИ</span><b>${result.kills}</b></div>
          </div>
          <div class="result-actions">
            <button class="btn btn-primary" data-gameover="retry">Попробовать снова</button>
            <button class="btn btn-subtle" data-gameover="menu">В главное меню</button>
          </div>
        </div>
      </div>`;
    this.openModal(html, { type: "gameover", dismissible: false });
    document.querySelectorAll("[data-gameover]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.gameover === "retry") {
          this.#closeModalSilent();
          this.game.restartLevel();
          this.input.setEnabled(true);
          this.#fitArena();
          this.#toast("Ещё одна попытка");
        } else {
          this.#goHome();
        }
      });
    });
  }

  onVersusRoundEnd(result) {
    this.input.setEnabled(false);
    if (result.winner === 0) this.vsWins.p1 += 1;
    else if (result.winner === 1) this.vsWins.p2 += 1;
    this.game.versusScore = { ...this.vsWins };
    this.dom.hudRound.textContent = `${this.game.round} · ${this.vsWins.p1}:${this.vsWins.p2}`;
    const matchOver = this.vsWins.p1 >= 2 || this.vsWins.p2 >= 2;
    const winnerName = result.winner === 0 ? "Игрок 1" : result.winner === 1 ? "Игрок 2" : "Ничья";
    const accent = result.winner === 1 ? "var(--pink)" : "var(--mint)";
    const title = matchOver
      ? (this.vsWins.p1 >= 2 ? "ПОБЕДА<br><em>ИГРОКА 1</em>" : "ПОБЕДА<br><em>ИГРОКА 2</em>")
      : result.winner === -1
        ? "РАУНД<br><em>ВНИЧЬЮ</em>"
        : `РАУНД ЗА<br><em>${winnerName.toUpperCase()}</em>`;
    const subtitle = matchOver
      ? `Матч завершён со счётом ${this.vsWins.p1}:${this.vsWins.p2}. ${winnerName} забирает дуэль.`
      : result.reason === "time" ? "Время вышло. Раунд не выявил победителя." : "Следующий раунд начнётся с новой процедурной арены.";
    const buttons = matchOver
      ? `<button class="btn btn-primary" data-vs="rematch">Реванш</button><button class="btn" data-vs="menu">В меню</button>`
      : `<button class="btn btn-primary" data-vs="next">Следующий раунд <span style="opacity:.55">→</span></button><div class="result-actions-row"><button class="btn" data-vs="rematch">Заново</button><button class="btn" data-vs="menu">В меню</button></div>`;
    const html = `
      <div class="modal-panel result-panel is-narrow" role="dialog" aria-modal="true" aria-label="Итог раунда">
        <div class="result-glow" style="background:radial-gradient(circle,${accent === "var(--pink)" ? "rgba(255,92,141,.16)" : "rgba(96,247,199,.16)"},transparent 66%)"></div>
        ${matchOver ? this.#confettiMarkup() : ""}
        <div class="result-content">
          <div class="result-kicker" style="color:${accent}">${matchOver ? "МАТЧ ЗАВЕРШЁН" : `РАУНД ${this.game.round}`}</div>
          <div class="duel-score">
            <div class="duel-player p1"><span>P1</span><b>Игрок 1</b></div>
            <div class="duel-score-value">${this.vsWins.p1}<i>:</i>${this.vsWins.p2}</div>
            <div class="duel-player p2"><span>P2</span><b>Игрок 2</b></div>
          </div>
          <h2 class="result-title" style="font-size:clamp(24px,5vw,37px)">${title}</h2>
          <p class="result-subtitle">${subtitle}</p>
          <div class="modal-actions">${buttons}</div>
        </div>
      </div>`;
    this.openModal(html, { type: "versus-result", dismissible: false });
    document.querySelectorAll("[data-vs]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.vs;
        this.#closeModalSilent();
        if (action === "next") {
          this.startVersusRound(this.game.round + 1);
        } else if (action === "rematch") {
          this.startVersusMatch();
        } else {
          this.#goHome();
        }
      });
    });
    if (matchOver) this.audio.play("victory", { volume: 0.8 });
  }

  #confettiMarkup() {
    const colors = ["#61f7c8", "#ff8b54", "#ffd479", "#ff5c8d", "#8fb6ff"];
    return `<div class="confetti" aria-hidden="true">${Array.from({ length: 26 }, (_, index) => {
      const left = (index * 3.7 + 3) % 96;
      const delay = (index % 7) * 0.16;
      const duration = 2.6 + (index % 5) * 0.35;
      const color = colors[index % colors.length];
      const size = 4 + (index % 4) * 2;
      return `<i style="left:${left}%;background:${color};width:${size}px;height:${size * 1.6}px;animation-delay:${delay}s;animation-duration:${duration}s"></i>`;
    }).join("")}</div>`;
  }

  onGameToast(payload) {
    if (this.screen !== "game") return;
    this.#toastGame(payload.text, payload.color, payload.accent);
  }

  #toastGame(text, color = "#61f7c8", accent = "") {
    if (!this.dom?.gameToastLayer) return;
    const item = document.createElement("div");
    item.className = "game-toast";
    item.style.setProperty("--toast-color", color);
    item.innerHTML = `${accent ? `<span class="toast-accent">${escapeHtml(accent)}</span>` : ""}<span>${escapeHtml(text)}</span>`;
    this.dom.gameToastLayer.appendChild(item);
    while (this.dom.gameToastLayer.children.length > 3) {
      this.dom.gameToastLayer.firstElementChild.remove();
    }
    setTimeout(() => {
      item.classList.add("is-out");
      setTimeout(() => item.remove(), 280);
    }, 2300);
  }

  #toast(text, tone = "info") {
    if (!this.dom?.toastRoot) return;
    const item = document.createElement("div");
    item.className = "toast";
    item.innerHTML = `<span class="toast-dot" style="background:${tone === "danger" ? "var(--danger)" : "var(--mint)"}"></span><span>${escapeHtml(text)}</span>`;
    this.dom.toastRoot.appendChild(item);
    setTimeout(() => {
      item.classList.add("is-out");
      setTimeout(() => item.remove(), 260);
    }, 2500);
  }

  // -------------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------------

  applyHud(hud) {
    this.currentHud = hud;
    if (this.screen !== "game") {
      this.#updateActionButtons(hud);
      return;
    }
    const player = hud.player;
    this.dom.hudKicker.textContent =
      hud.mode === "versus" ? `ДУЭЛЬ · РАУНД ${hud.round}` : `УРОВЕНЬ ${String(hud.level).padStart(2, "0")}`;
    this.dom.hudLevelName.textContent = hud.levelName;
    this.dom.hudEnemies.textContent =
      hud.mode === "versus" ? String(Math.max(0, this.game.players.filter((p) => p.alive).length - (player?.alive ? 0 : 1))) : String(hud.enemiesRemaining);
    this.dom.hudScore.textContent = formatScore(hud.score);
    this.dom.hudTimer.textContent = hud.timeLabel;
    if (this.dom.mhKicker) {
      this.dom.mhKicker.textContent =
        hud.mode === "versus" ? `ДУЭЛЬ · РАУНД ${hud.round}` : `УРОВЕНЬ ${String(hud.level).padStart(2, "0")}`;
      this.dom.mhLevelName.textContent = hud.levelName;
      this.dom.mhTimer.textContent = hud.timeLabel;
      this.dom.mhScore.textContent = formatScore(hud.score);
      this.dom.mhEnemies.textContent =
        hud.mode === "versus" ? String(Math.max(0, this.game.players.filter((p) => p.alive).length - (player?.alive ? 0 : 1))) : String(hud.enemiesRemaining);
    }
    this.dom.hudObjectiveLabel.textContent = hud.mode === "versus" ? "СОПЕРНИК" : "ВРАГИ";
    this.dom.hudRound.textContent = `${hud.round} · ${this.vsWins.p1}:${this.vsWins.p2}`;
    this.dom.objectiveText.textContent =
      hud.mode === "versus"
        ? "Уничтожьте соперника"
        : hud.portalActive
          ? "Врата открыты — доберитесь до выхода"
          : "Уничтожьте всех врагов";
    this.dom.objectivePill.classList.toggle("is-hidden", false);
    this.#renderHearts(hud);
    this.#renderPowerStrip(hud);
    this.#updateActionButtons(hud);
    this.#renderDesktopPanels(hud);
  }

  #renderHearts(hud) {
    if (!hud.player) return;
    const hearts = [];
    for (let index = 0; index < hud.player.maxHearts; index += 1) {
      hearts.push(`<span class="heart ${index < hud.player.hearts ? "" : "empty"}" title="Сердце ${index + 1}">${HEART_SVG}</span>`);
    }
    if (hud.player.armor > 0) {
      hearts.push(`<span class="armor-badge" title="Доспехи: ${hud.player.armor}">${hud.player.armor}</span>`);
    }
    const html = hearts.join("");
    this.dom.hudHearts.innerHTML = html;
    if (this.dom.mhHearts) this.dom.mhHearts.innerHTML = html;
  }

  #renderPowerStrip(hud) {
    if (!hud.player) return;
    const chips = [];
    const player = this.game.players[0];
    if (player) {
      chips.push(this.#powerChip("range", player.range, "Радиус взрыва"));
      chips.push(this.#powerChip("bomb", player.baseBombs, "Лимит бомб"));
      if (player.speedLevels > 0) chips.push(this.#powerChip("speed", player.speedLevels, "Скорость"));
      if (player.armor > 0) chips.push(this.#powerChip("armor", player.armor, "Доспехи"));
      for (const key of player.powers) {
        if (POWERUPS[key]) chips.push(this.#powerChip(key, null, POWERUPS[key].name, true));
      }
      if (player.mount) {
        const mount = MOUNTS[player.mount.key];
        chips.push(`<span class="power-chip" style="--chip-color:${mount?.color || "#ffd479"}" title="${escapeHtml(mount?.name || "")}">${mount?.abilityIcon || "♞"}</span>`);
      }
    }
    const html = chips.join("");
    this.dom.powerStrip.innerHTML = html;
    this.dom.p1Equipped.innerHTML = chips.slice(0, 10).join("");
  }

  #powerChip(key, count, title, isNew = false) {
    const def = POWERUPS[key];
    if (!def) return "";
    return `<span class="power-chip ${isNew ? "is-new" : ""}" style="--chip-color:${def.color}" title="${escapeHtml(title || def.name)}">${def.icon}${count ? `<b>${count}</b>` : ""}</span>`;
  }

  #renderDesktopPanels(hud) {
    if (!this.isDesktop) return;
    const p1 = this.game.players[0];
    if (this.dom.p1Vitals && p1) {
      this.dom.p1Vitals.innerHTML = this.#vitalsMarkup(p1);
    }
    const p2 = this.game.players[1];
    if (!p2) {
      this.dom.p2Equipped.innerHTML = "";
      if (this.dom.p2Vitals) this.dom.p2Vitals.innerHTML = "";
      return;
    }
    if (this.dom.p2Vitals) this.dom.p2Vitals.innerHTML = this.#vitalsMarkup(p2);
    const chips = [];
    chips.push(this.#powerChip("range", p2.range, "Радиус"));
    chips.push(this.#powerChip("bomb", p2.baseBombs, "Лимит бомб"));
    if (p2.speedLevels > 0) chips.push(this.#powerChip("speed", p2.speedLevels, "Скорость"));
    if (p2.armor > 0) chips.push(this.#powerChip("armor", p2.armor, "Доспехи"));
    for (const key of p2.powers) {
      if (POWERUPS[key]) chips.push(this.#powerChip(key, null, POWERUPS[key].name, true));
    }
    if (p2.mount) {
      const mount = MOUNTS[p2.mount.key];
      chips.push(`<span class="power-chip" style="--chip-color:${mount?.color || "#ffd479"}" title="${escapeHtml(mount?.name || "")}">${mount?.abilityIcon || "♞"}</span>`);
    }
    this.dom.p2Equipped.innerHTML = chips.join("");
  }

  #vitalsMarkup(player) {
    const hearts = Array.from({ length: player.maxHearts }, (_, index) =>
      `<span class="heart ${index < player.hearts ? "" : "empty"}">${HEART_SVG}</span>`
    ).join("");
    return `<span class="vitals-hearts">${hearts}${player.armor ? `<span class="armor-badge">${player.armor}</span>` : ""}</span>
      <span class="vitals-meta">${player.range}✦ · ${player.maxBombs}💣</span>`;
  }

  #updateActionButtons(hud = this.currentHud) {
    if (!this.dom.actionPad) return;
    const bombButton = this.dom.actionPad.querySelector('[data-game-btn="bomb"]');
    const detonateButton = this.dom.actionPad.querySelector('[data-game-btn="detonate"]');
    const actionButton = this.dom.actionPad.querySelector('[data-game-btn="action"]');
    if (!hud?.player) {
      bombButton?.classList.remove("is-disabled");
      detonateButton?.classList.add("is-disabled");
      if (this.dom.actionLabel) this.dom.actionLabel.textContent = "Действие";
      return;
    }
    bombButton?.classList.toggle("is-disabled", hud.player.bombsActive >= hud.player.maxBombs);
    detonateButton?.classList.toggle("is-disabled", !hud.player.hasDetonator || hud.player.bombsActive <= 0);
    const hint = hud.actionHint || "";
    const label = hint.includes("Бросок")
      ? "Бросок"
      : hint.includes("Пламя")
        ? "Пламя"
        : hint.includes("Прыжок")
          ? "Прыжок"
          : hint.includes("Свет")
            ? "Свет"
            : "Действие";
    if (this.dom.actionLabel) this.dom.actionLabel.textContent = label;
    actionButton?.classList.toggle("is-disabled", false);
    const hintEl = this.dom.contextHint;
    if (hintEl) {
      const text = this.game.getActionHint(this.game.players[0]);
      if (text) {
        hintEl.textContent = text;
        hintEl.classList.add("is-active");
      } else {
        hintEl.classList.remove("is-active");
      }
    }
  }

  #updateLiveHud(timestamp) {
    if (!this.game.level) return;
    if (timestamp - this.lastTimerUpdate > 80) {
      this.lastTimerUpdate = timestamp;
      const timeLabel = formatTime(this.game.elapsed);
      const scoreLabel = formatScore(this.game.score);
      const enemiesLabel =
        this.game.mode === "versus"
          ? String(this.game.players.filter((p) => p.alive).length > 1 ? 1 : 0)
          : String(this.game.getEnemiesRemaining());
      this.dom.hudTimer.textContent = timeLabel;
      this.dom.hudScore.textContent = scoreLabel;
      this.dom.hudEnemies.textContent = enemiesLabel;
      if (this.dom.mhTimer) {
        this.dom.mhTimer.textContent = timeLabel;
        this.dom.mhScore.textContent = scoreLabel;
        this.dom.mhEnemies.textContent = enemiesLabel;
      }
      if (this.game.portalActive) {
        this.dom.objectiveText.textContent = this.game.mode === "versus" ? "Уничтожьте соперника" : "Врата открыты — доберитесь до выхода";
      }
      this.#updateActionButtons(this.currentHud);
    }
  }

  #renderKeyHints() {
    const keys = this.settings.keys;
    const spans = (player) => {
      const k = keys[player];
      return `<span><kbd>${keyLabel(k.left)}</kbd><kbd>${keyLabel(k.up)}</kbd><kbd>${keyLabel(k.down)}</kbd><kbd>${keyLabel(k.right)}</kbd> движение</span>
        <span><kbd>${keyLabel(k.bomb)}</kbd> бомба</span>
        <span><kbd>${keyLabel(k.detonate)}</kbd> детонатор</span>
        <span><kbd>${keyLabel(k.action)}</kbd> действие</span>`;
    };
    const p1 = document.querySelector("#desktopP1 .key-hints");
    const p2 = document.querySelector("#desktopP2 .key-hints");
    if (p1) p1.innerHTML = spans("p1");
    if (p2) p2.innerHTML = spans("p2");
    const footer = document.querySelector("#gameFooterHint");
    if (footer) {
      footer.textContent = `Управление: ${keyLabel(keys.p1.left)}/${keyLabel(keys.p1.up)}/${keyLabel(keys.p1.down)}/${keyLabel(keys.p1.right)} · ${keyLabel(keys.p1.bomb)} — бомба · ${keyLabel(keys.p1.detonate)} — детонатор · ${keyLabel(keys.p1.action)} — действие · Esc — пауза`;
    }
  }

  // -------------------------------------------------------------------------
  // Menu, levels, progress
  // -------------------------------------------------------------------------

  #updateMenu(initial = false) {
    const progress = this.save.progress;
    const unlocked = clamp(progress.unlocked, 1, TOTAL_LEVELS);
    const levelNumber = progress.completed.length >= TOTAL_LEVELS ? TOTAL_LEVELS : unlocked;
    const palette = createPalette(levelNumber);
    this.menuScene.setPalette(palette);
    this.dom.playerName.textContent = telegram.name;
    this.dom.playerAvatar.textContent = telegram.initials;
    this.dom.campaignSubtitle.textContent =
      progress.completed.length >= TOTAL_LEVELS
        ? "Кампания пройдена · 50/50"
        : this.isMobile
          ? `Одиночный режим · уровень ${unlocked}`
          : `Уровень ${unlocked} · ${palette.name}`;
    this.dom.versusButton.hidden = this.isMobile;
    this.dom.heroCaption.textContent =
      progress.completed.length >= TOTAL_LEVELS ? "Все миры исследованы. Спасибо, Бомбер!" : `Новая экспедиция · ${palette.name}`;
    this.#updateProgressUI();
    this.#updateSoundUi();
    if (initial) this.#updateBootUi();
  }

  #updateProgressUI() {
    const progress = this.save.progress;
    const completed = progress.completed.length;
    this.dom.progressLabel.textContent = `${completed} / ${TOTAL_LEVELS}`;
    this.dom.progressBar.style.width = `${(completed / TOTAL_LEVELS) * 100}%`;
    this.dom.totalScore.textContent = formatScore(this.save.totalScore);
    this.dom.totalStars.textContent = String(this.save.totalStars);
    const best = progress.completed.length ? Math.max(...progress.completed) : 1;
    this.dom.bestLevel.textContent = String(best);
    this.dom.levelsUnlocked.textContent = String(progress.unlocked);
    this.dom.levelsFooterText.textContent =
      progress.completed.length >= TOTAL_LEVELS
        ? "Все 50 этапов пройдены. Можно переиграть любой мир за новые звёзды."
        : "Пройдите этап, чтобы открыть следующий. Каждый мир генерируется заново.";
  }

  #buildLevelGrid() {
    if (!this.dom.levelGrid) return;
    const cards = [];
    const progress = this.save.progress;
    for (let level = 1; level <= TOTAL_LEVELS; level += 1) {
      let palette = this._levelCardCache.get(level);
      if (!palette) {
        palette = createPalette(level);
        this._levelCardCache.set(level, palette);
      }
      const unlocked = level <= progress.unlocked;
      const completed = progress.completed.includes(level);
      const best = progress.levels[level];
      const current = unlocked && !completed && level === progress.unlocked;
      const stars = best
        ? [1, 2, 3].map((n) => `<span class="${n <= best.stars ? "" : "dim"}">${STAR}</span>`).join("")
        : "";
      cards.push(`
        <button class="level-card ${completed ? "complete" : ""} ${current ? "current" : ""} ${unlocked ? "" : "locked"}" data-level="${level}" ${unlocked ? "" : "disabled"} aria-label="Уровень ${level}: ${escapeHtml(palette.name)}${unlocked ? "" : ", закрыт"}" style="--card-accent:${palette.accent};--card-glow:${withAlpha(palette.accent, 0.22)};--card-wall:${palette.wallSide};--card-floor:${palette.floorA};">
          <span class="level-card-top">
            <span class="level-number">${String(level).padStart(2, "0")}</span>
            <span class="level-state-icon">${completed ? CHECK_SVG : unlocked ? "→" : LOCK_SVG}</span>
          </span>
          <span>
            <span class="level-card-name">${escapeHtml(palette.name)}</span>
            <span class="level-card-stars">${stars || "&nbsp;"}</span>
          </span>
          ${unlocked ? "" : '<span class="level-lock">' + LOCK_SVG + "</span>"}
        </button>`);
    }
    this.dom.levelGrid.innerHTML = cards.join("");
  }

  #updateSoundUi() {
    const enabled = Boolean(this.settings.music || this.settings.sfx);
    document.body.classList.toggle("sound-off", !enabled);
    this.dom.bootSound?.classList.toggle("is-active", enabled);
    this.dom.bootSound && (this.dom.bootSound.innerHTML = `<span class="toggle-led"></span>${enabled ? "Звук включён" : "Звук выключен"}`);
  }

  quickToggleSound() {
    const enable = !(this.settings.music || this.settings.sfx);
    this.settings.music = enable;
    this.settings.sfx = enable;
    this.save.updateSettings({ music: enable, sfx: enable });
    this.audio.setSettings(this.settings);
    this.#updateSoundUi();
    if (enable) this.#refreshMusicScene();
    this.#toast(enable ? "Звук включён" : "Звук выключен");
    telegram.haptic("light");
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  openSettings(returnToPause = false) {
    const wasPaused = returnToPause && this.game.state === "paused";
    this.#buildSettingsPanel(wasPaused);
  }

  #buildSettingsPanel(returnToPause) {
    const s = this.settings;
    const keys = s.keys;
    const bindRow = (player, action, label) => `
      <div class="keybind-row">
        <span class="keybind-label">${label}</span>
        <button class="keybind-button" data-bind-player="${player}" data-bind-action="${action}">${keyLabel(keys[player][action])}</button>
      </div>`;
    const controlsP2 = this.isMobile
      ? `<div class="touch-control-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 19h14M7 16l-3-3m13 3 3-3M8 8h8a4 4 0 0 1 0 8H8a4 4 0 0 1 0-8Z"/></svg><p>На телефоне доступен только одиночный режим. Стик слева и четыре кнопки справа созданы для большого пальца; размер элементов можно изменить ниже.</p></div>`
      : "";
    const p2Column = this.isMobile
      ? ""
      : `<div>
          <div class="keybind-player-title"><i class="p2">P2</i>Игрок 2 · дуэль</div>
          <div class="keybind-grid">
            ${bindRow("p2", "up", "Вверх")}
            ${bindRow("p2", "down", "Вниз")}
            ${bindRow("p2", "left", "Влево")}
            ${bindRow("p2", "right", "Вправо")}
            ${bindRow("p2", "bomb", "Бомба")}
            ${bindRow("p2", "detonate", "Детонатор")}
            ${bindRow("p2", "action", "Действие")}
          </div>
        </div>`;
    const html = `
      <div class="modal-panel is-wide" role="dialog" aria-modal="true" aria-label="Настройки">
        <div class="modal-head">
          <div class="modal-head-copy"><span class="eyebrow">BOMBMAN / SETTINGS</span><h2 class="modal-title">Настройки</h2></div>
          <button class="modal-close" data-modal-close aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="modal-body">
          <div class="settings-tabs" role="tablist">
            <button class="settings-tab is-active" data-settings-tab="audio" role="tab">Аудио</button>
            <button class="settings-tab" data-settings-tab="controls" role="tab">Управление</button>
            <button class="settings-tab" data-settings-tab="game" role="tab">Игра</button>
          </div>

          <div class="settings-pane is-active" data-settings-pane="audio">
            <div class="setting-row">
              <div class="setting-copy"><b>Музыка</b><small>Процедурный саундтрек, уникальный для каждого мира</small></div>
              <div class="setting-control"><button class="toggle ${s.music ? "is-on" : ""}" data-toggle="music" aria-label="Музыка"></button></div>
            </div>
            <div class="setting-row">
              <div class="setting-copy"><b>Громкость музыки</b><small>Меняется сразу, без перезапуска</small></div>
              <div class="setting-control"><input type="range" min="0" max="100" value="${Math.round(s.musicVolume * 100)}" data-range="musicVolume" aria-label="Громкость музыки"><span class="slider-value" data-range-value="musicVolume">${Math.round(s.musicVolume * 100)}%</span></div>
            </div>
            <div class="setting-row">
              <div class="setting-copy"><b>Звуковые эффекты</b><small>Взрывы, бонусы, шаги и интерфейс</small></div>
              <div class="setting-control"><button class="toggle ${s.sfx ? "is-on" : ""}" data-toggle="sfx" aria-label="Звуковые эффекты"></button></div>
            </div>
            <div class="setting-row">
              <div class="setting-copy"><b>Громкость эффектов</b><small>Отдельный баланс для взрывов и UI</small></div>
              <div class="setting-control"><input type="range" min="0" max="100" value="${Math.round(s.sfxVolume * 100)}" data-range="sfxVolume" aria-label="Громкость эффектов"><span class="slider-value" data-range-value="sfxVolume">${Math.round(s.sfxVolume * 100)}%</span></div>
            </div>
          </div>

          <div class="settings-pane" data-settings-pane="controls">
            <div class="keybind-columns">
              <div>
                <div class="keybind-player-title"><i>P1</i>Игрок 1 · одиночная игра</div>
                <div class="keybind-grid">
                  ${bindRow("p1", "up", "Вверх")}
                  ${bindRow("p1", "down", "Вниз")}
                  ${bindRow("p1", "left", "Влево")}
                  ${bindRow("p1", "right", "Вправо")}
                  ${bindRow("p1", "bomb", "Бомба")}
                  ${bindRow("p1", "detonate", "Детонатор")}
                  ${bindRow("p1", "action", "Действие")}
                </div>
              </div>
              ${p2Column}
            </div>
            ${controlsP2}
            <div class="settings-note">Нажмите на клавишу, затем нажмите новую клавишу. Esc отменяет переназначение. Если клавиша уже занята другим игроком, она снимается у него и остаётся без назначения («—»). Детонатор и действие также доступны как экранные кнопки на телефоне.</div>
            <div class="settings-section-title">Экранные кнопки</div>
            <div class="setting-row">
              <div class="setting-copy"><b>Размер стика и кнопок</b><small>Для разных размеров ладони и экрана</small></div>
              <div class="setting-control">
                <div class="segmented" data-segment="touchSize">
                  <button class="${s.touchSize === "compact" ? "is-active" : ""}" data-value="compact">S</button>
                  <button class="${s.touchSize === "normal" ? "is-active" : ""}" data-value="normal">M</button>
                  <button class="${s.touchSize === "large" ? "is-active" : ""}" data-value="large">L</button>
                </div>
              </div>
            </div>
            <div class="danger-zone"><button class="btn btn-ghost" data-settings-reset-keys>Сбросить клавиши по умолчанию</button></div>
          </div>

          <div class="settings-pane" data-settings-pane="game">
            <div class="setting-row">
              <div class="setting-copy"><b>Тряска экрана</b><small>Импульс камеры при взрывах и уроне</small></div>
              <div class="setting-control"><button class="toggle ${s.screenShake ? "is-on" : ""}" data-toggle="screenShake" aria-label="Тряска экрана"></button></div>
            </div>
            <div class="setting-row">
              <div class="setting-copy"><b>Качество эффектов</b><small>Больше частиц — красивее, но требовательнее</small></div>
              <div class="setting-control">
                <div class="segmented" data-segment="particles">
                  <button class="${s.particles === "low" ? "is-active" : ""}" data-value="low">Низкое</button>
                  <button class="${s.particles === "medium" ? "is-active" : ""}" data-value="medium">Среднее</button>
                  <button class="${s.particles === "high" ? "is-active" : ""}" data-value="high">Высокое</button>
                </div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-copy"><b>Показывать FPS</b><small>Счётчик кадров в нижней панели</small></div>
              <div class="setting-control"><button class="toggle ${s.showFps ? "is-on" : ""}" data-toggle="showFps" aria-label="Показывать FPS"></button></div>
            </div>
            <div class="settings-note">BombMan — процедурная игра: палитры, арены, погода, музыка и облик противников создаются заново на каждом уровне. Уровень нельзя «запомнить» — его можно только переиграть.</div>
            <div class="danger-zone">
              <button class="btn btn-danger" data-settings-reset-progress>Сбросить прогресс кампании</button>
            </div>
          </div>

          <div class="modal-actions" style="margin-top:18px"><button class="btn btn-primary" data-modal-close>Готово</button></div>
        </div>
      </div>`;
    this.openModal(html, {
      type: "settings",
      dismissible: true,
      onClose: () => {
        this.input.cancelCapture();
        if (returnToPause && this.game.state === "paused") {
          setTimeout(() => this.openPause(), 10);
        }
      }
    });
    const panel = this.dom.modalRoot.querySelector(".modal-panel");
    if (!panel) return;

    panel.querySelectorAll("[data-settings-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        panel.querySelectorAll("[data-settings-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
        panel.querySelectorAll("[data-settings-pane]").forEach((pane) => pane.classList.toggle("is-active", pane.dataset.settingsPane === button.dataset.settingsTab));
      });
    });

    panel.querySelectorAll("[data-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.toggle;
        const value = !this.settings[key];
        this.settings[key] = value;
        button.classList.toggle("is-on", value);
        this.save.updateSettings({ [key]: value });
        this.#applySettingsClasses();
        this.audio.setSettings(this.settings);
        this.game.shakeEnabled = this.settings.screenShake;
        this.#refreshMusicScene();
        this.#updateSoundUi();
        this.audio.play("click", { volume: 0.6 });
      });
    });

    panel.querySelectorAll("[data-range]").forEach((input) => {
      const key = input.dataset.range;
      const update = () => {
        const value = clamp(Number(input.value) / 100, 0, 1);
        this.settings[key] = value;
        const label = panel.querySelector(`[data-range-value="${key}"]`);
        if (label) label.textContent = `${Math.round(value * 100)}%`;
        this.save.updateSettings({ [key]: value });
        this.audio.setSettings(this.settings);
      };
      input.addEventListener("input", update);
      input.addEventListener("change", update);
    });

    panel.querySelectorAll("[data-segment]").forEach((segment) => {
      const key = segment.dataset.segment;
      segment.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
          const value = button.dataset.value;
          segment.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
          this.settings[key] = value;
          this.save.updateSettings({ [key]: value });
          this.#applySettingsClasses();
          if (key === "particles") {
            this.renderer.setQuality(value);
            this.game.setParticleQuality(value);
          }
          this.audio.play("click", { volume: 0.4 });
        });
      });
    });

    panel.querySelectorAll("[data-bind-player]").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.input.isListening()) return;
        const player = button.dataset.bindPlayer;
        const action = button.dataset.bindAction;
        const original = keyLabel(this.settings.keys[player][action]);
        button.textContent = "...";
        button.classList.add("is-listening");
        this.input.captureNextKey((code) => {
          button.classList.remove("is-listening");
          if (!code) {
            button.textContent = original;
            return;
          }
          if (code === "Escape") {
            button.textContent = original;
            return;
          }
          const samePlayerConflict = Object.entries(this.settings.keys[player]).find(
            ([otherAction, otherCode]) => otherAction !== action && otherCode === code
          );
          if (samePlayerConflict) {
            button.textContent = original;
            this.#toast("Эта клавиша уже занята у этого игрока");
            this.audio.play("denied", { volume: 0.4 });
            return;
          }

          const cleared = [];
          for (const otherPlayer of ["p1", "p2"]) {
            if (otherPlayer === player) continue;
            for (const [otherAction, otherCode] of Object.entries(this.settings.keys[otherPlayer])) {
              if (otherCode === code) {
                this.settings.keys[otherPlayer][otherAction] = "";
                cleared.push({ otherPlayer, otherAction });
              }
            }
          }

          this.settings.keys[player][action] = code;
          this.save.updateSettings({ keys: this.settings.keys });
          this.settings = this.save.settings;
          this.input.setBindings(this.settings.keys);

          panel.querySelectorAll("[data-bind-player]").forEach((item) => {
            const owner = item.dataset.bindPlayer;
            const bindAction = item.dataset.bindAction;
            item.textContent = keyLabel(this.settings.keys[owner][bindAction]);
          });
          this.#renderKeyHints();
          this.audio.play("click", { volume: 0.6 });
          telegram.haptic("light");

          if (cleared.length) {
            const otherPlayer = cleared[0].otherPlayer === "p1" ? 1 : 2;
            const actions = cleared.length === 1 ? "действие" : "действия";
            this.#toast(`Клавиша ${keyLabel(code)} снята у Игрока ${otherPlayer}; ${actions} теперь без клавиши`);
          }
        });
      });
    });

    panel.querySelector("[data-settings-reset-keys]")?.addEventListener("click", () => {
      this.settings.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS));
      this.save.updateSettings({ keys: this.settings.keys });
      this.settings = this.save.settings;
      this.input.setBindings(this.settings.keys);
      this.#renderKeyHints();
      this.#buildSettingsPanel(returnToPause);
      this.#toast("Клавиши сброшены");
    });

    panel.querySelector("[data-settings-reset-progress]")?.addEventListener("click", () => {
      this.#confirmResetProgress();
    });

    setTimeout(() => panel.querySelector(".settings-tab")?.focus(), 50);
  }

  #refreshMusicScene() {
    if (!this.settings.music) return;
    this.audio.unlock().then(() => {
      if (this.audio.musicTimer && this.audio.musicMode) {
        this.audio.setPaused(this.game.state === "paused");
        return;
      }
      if (this.screen === "game" && this.game.level) {
        this.audio.startMusic("game", {
          seed: this.game.level.music.seed,
          tempo: this.game.level.music.tempo,
          root: this.game.level.music.root,
          mode: this.game.level.music.mode
        });
        if (this.game.state === "paused") this.audio.setPaused(true);
      } else {
        this.audio.startMusic("menu");
      }
    });
  }

  #applySettingsClasses() {
    const s = this.settings;
    document.body.classList.remove("touch-size-compact", "touch-size-normal", "touch-size-large");
    document.body.classList.add(`touch-size-${s.touchSize || "normal"}`);
    this.input.setBindings(s.keys);
    this.audio.setSettings(s);
    this.game.shakeEnabled = s.screenShake;
    this.game.setParticleQuality(s.particles);
    this.renderer.setQuality(s.particles);
    this.#updateSoundUi();
    if (!this.settings.showFps && this.dom.fpsLabel) this.dom.fpsLabel.textContent = "LIVE";
    this.#renderKeyHints();
  }

  // -------------------------------------------------------------------------
  // Codex
  // -------------------------------------------------------------------------

  openCodex(initialTab = "basics") {
    this.#closeModalSilent();
    const basicCards = [
      ["Движение", "Стик слева или назначенные клавиши. Персонаж шагает строго по клеткам и всегда останавливается в центре клетки: уворачивайтесь от огня и не зажимайтесь в углах."],
      ["Бомбы", "Кнопка «Бомба» ставит заряд под ногами. Взрыв идёт крестом, ломает хрупкие блоки и останавливается о монолит."],
      ["Врата", "Уничтожьте всех врагов — откроется портал. Войдите в него, чтобы завершить мир и получить звёзды за время."],
      ["Снаряжение", "Бонусы, броня, дополнительные сердца и животное переносятся в следующий уровень и сохраняются между запусками игры."],
      ["Животные", "На некоторых уровнях лежит яйцо. Коснитесь его, чтобы оседлать существо. Питомец даёт способность и принимает первый удар."],
      ["Дуэль", "Только на компьютере: локальный бой на одном экране. Побеждает тот, кто первым выиграет два раунда."],
      ["Процедурность", "Все 50 миров генерируются из сида: палитра, архитектура, декор, погода, музыка и облик врагов уникальны."],
      ["Классика", "В игру добавлены детонатор, пинок бомбы, бросок через стены, сенсорный взрыватель, ездовые животные, дуэль и коллекция трофеев."],
      ["Тактика", "Не ставьте бомбу в тупике без выхода. Оставляйте себе коридор, приманивайте охотников и бейте броненосцев серией из трёх взрывов."]
    ];
    const basics = basicCards
      .map(
        ([title, text], index) =>
          `<div class="basic-card"><span class="basic-number">${String(index + 1).padStart(2, "0")}</span><div><b>${title}</b><p>${text}</p></div></div>`
      )
      .join("");
    const powerCards = POWERUP_LIST.map(
      (power) =>
        `<div class="codex-card" style="--codex-color:${power.color}">
          <span class="codex-icon">${power.icon}</span>
          <div class="codex-copy"><b>${escapeHtml(power.name)}</b><span>${escapeHtml(power.desc)}</span><em>${escapeHtml(power.short)} · с уровня ${POWERUP_UNLOCK_LEVEL[power.key] || 1}</em></div>
        </div>`
    ).join("");
    const enemyCards = ENEMY_LIST.map(
      (enemy) =>
        `<div class="codex-card" style="--codex-color:${enemy.color}">
          <span class="codex-icon">${enemy.glyph}</span>
          <div class="codex-copy"><b>${escapeHtml(enemy.name)}</b><span>${escapeHtml(enemy.desc)}</span><em>${escapeHtml(enemy.short)} · с уровня ${enemy.unlock}</em></div>
        </div>`
    ).join("");
    const mountCards = MOUNT_LIST.map(
      (mount) =>
        `<div class="codex-card" style="--codex-color:${mount.color}">
          <span class="codex-icon">${mount.abilityIcon}</span>
          <div class="codex-copy"><b>${escapeHtml(mount.name)}</b><span>${escapeHtml(mount.desc)}</span><em>${escapeHtml(mount.short)}</em></div>
        </div>`
    ).join("");
    const html = `
      <div class="modal-panel is-wide" role="dialog" aria-modal="true" aria-label="Энциклопедия">
        <div class="modal-head">
          <div class="modal-head-copy"><span class="eyebrow">BOMBMAN / CODEX</span><h2 class="modal-title">Энциклопедия бомбера</h2></div>
          <button class="modal-close" data-modal-close aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="modal-body">
          <div class="codex-tabs" role="tablist">
            <button class="codex-tab ${initialTab === "basics" ? "is-active" : ""}" data-codex-tab="basics">Основы</button>
            <button class="codex-tab ${initialTab === "powers" ? "is-active" : ""}" data-codex-tab="powers">Бонусы</button>
            <button class="codex-tab ${initialTab === "enemies" ? "is-active" : ""}" data-codex-tab="enemies">Враги</button>
            <button class="codex-tab ${initialTab === "mounts" ? "is-active" : ""}" data-codex-tab="mounts">Животные</button>
          </div>
          <div class="codex-content">
            <div class="codex-pane ${initialTab === "basics" ? "is-active" : ""}" data-codex-pane="basics"><div class="codex-basics">${basics}</div></div>
            <div class="codex-pane ${initialTab === "powers" ? "is-active" : ""}" data-codex-pane="powers"><div class="codex-grid">${powerCards}</div></div>
            <div class="codex-pane ${initialTab === "enemies" ? "is-active" : ""}" data-codex-pane="enemies"><div class="codex-grid">${enemyCards}</div></div>
            <div class="codex-pane ${initialTab === "mounts" ? "is-active" : ""}" data-codex-pane="mounts"><div class="codex-grid">${mountCards}</div></div>
          </div>
        </div>
      </div>`;
    this.openModal(html, { type: "codex", dismissible: true });
    const panel = this.dom.modalRoot.querySelector(".modal-panel");
    panel?.querySelectorAll("[data-codex-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        panel.querySelectorAll("[data-codex-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
        panel.querySelectorAll("[data-codex-pane]").forEach((pane) => pane.classList.toggle("is-active", pane.dataset.codexPane === button.dataset.codexTab));
      });
    });
    panel?.querySelectorAll(".codex-pane").forEach((pane) => {
      if (!pane.classList.contains("is-active")) pane.style.display = "none";
    });
    panel?.querySelectorAll("[data-codex-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        panel.querySelectorAll(".codex-pane").forEach((pane) => {
          pane.style.display = pane.classList.contains("is-active") ? "" : "none";
        });
      });
    });
  }

  // -------------------------------------------------------------------------
  // Modals
  // -------------------------------------------------------------------------

  openModal(html, { type = "generic", dismissible = true, onClose = null } = {}) {
    this.#closeModalSilent();
    const token = ++this.modalToken;
    this.dom.modalRoot.innerHTML = `
      <div class="modal-backdrop" data-modal-backdrop></div>
      ${html}`;
    this.dom.modalRoot.classList.add("is-open");
    this.activeModal = { type, dismissible, onClose, token };
    const panel = this.dom.modalRoot.querySelector(".modal-panel");
    panel?.querySelectorAll("[data-modal-close]").forEach((button) => {
      button.addEventListener("click", () => this.closeModal());
    });
    setTimeout(() => {
      const focusable = panel?.querySelector("button, [href], input, select, [tabindex]");
      focusable?.focus?.({ preventScroll: true });
    }, 30);
    return panel;
  }

  closeModal({ silent = false } = {}) {
    if (!this.activeModal) {
      this.#closeModalSilent();
      return;
    }
    const modal = this.activeModal;
    this.activeModal = null;
    this.dom.modalRoot.classList.remove("is-open");
    this.dom.modalRoot.innerHTML = "";
    if (!silent) modal.onClose?.();
  }

  #closeModalSilent() {
    this.activeModal = null;
    this.modalToken += 1;
    if (this.dom?.modalRoot) {
      this.dom.modalRoot.classList.remove("is-open");
      this.dom.modalRoot.innerHTML = "";
    }
  }

  #confirmDialog(title, text, confirmLabel, onConfirm, danger = false) {
    const html = `
      <div class="modal-panel is-narrow" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="modal-head">
          <div class="modal-head-copy"><span class="eyebrow">ПОДТВЕРЖДЕНИЕ</span><h2 class="modal-title">${escapeHtml(title)}</h2></div>
          <button class="modal-close" data-modal-close aria-label="Отмена"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="modal-body">
          <p class="modal-text">${escapeHtml(text)}</p>
          <div class="modal-actions">
            <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-confirm>${escapeHtml(confirmLabel)}</button>
            <button class="btn btn-subtle" data-modal-close>Отмена</button>
          </div>
        </div>
      </div>`;
    this.openModal(html, {
      type: "confirm",
      dismissible: true,
      onClose: () => {
        if (this.screen === "game" && this.game.state === "paused") {
          setTimeout(() => this.openPause(), 10);
        }
      }
    });
    const panel = this.dom.modalRoot.querySelector(".modal-panel");
    panel?.querySelector("[data-confirm]")?.addEventListener("click", () => {
      this.#closeModalSilent();
      onConfirm();
    });
  }

  // -------------------------------------------------------------------------
  // Orientation & visibility
  // -------------------------------------------------------------------------

  #updateOrientation() {
    const isPortrait = window.innerWidth < window.innerHeight;
    const isMobileDevice = this.isMobile || isMobileClient;
    const shouldShow = isMobileDevice && isPortrait;

    if (this.dom.orientation) {
      if (shouldShow) {
        this.dom.orientation.style.display = "flex";
      } else {
        this.dom.orientation.style.display = "";
      }
    }

    if (shouldShow) {
      if (this.screen === "game" && this.game.state === "playing") {
        this.game.setPaused(true);
        this.input.setEnabled(false);
        this.pausedByOrientation = true;
      } else if (this.screen === "game" && this.game.state === "intro" && this.introActive) {
        this.#clearIntroTimers();
        this.closeModal({ silent: true });
        this.game.state = "paused";
        this.input.setEnabled(false);
        this.pausedByOrientation = true;
      }
    } else {
      if (this.pausedByOrientation) {
        this.pausedByOrientation = false;
        if (this.game.state === "paused" && !this.activeModal) this.resumeGame();
      }
    }
  }

  #onVisibilityChange() {
    this.audio.setVisibility(document.hidden);
    if (document.hidden && this.screen === "game" && this.game.state === "playing") {
      this.openPause();
    }
  }

  #initTelegramUser() {
    if (telegram.user) {
      const name = [telegram.user.first_name, telegram.user.last_name].filter(Boolean).join(" ").trim();
      if (name) this.dom.playerName.textContent = name;
    }
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function waitForTelegramSdk(timeout = 900) {
  if (window.Telegram?.WebApp) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("telegram-sdk-ready", finish);
      resolve();
    };
    window.addEventListener("telegram-sdk-ready", finish, { once: true });
    window.setTimeout(finish, timeout);
  });
}

waitForTelegramSdk().then(() => {
  telegram.refresh();
  const app = new BombManApp();

  window.BombManDebug = {
    app,
    startCampaign: (level = 1) => app.startCampaign(level),
    startVersus: () => app.startVersusMatch(),
    finishIntro: () => app.finishIntro(),
    game: () => app.game,
    save: () => app.save
  };
});