/**
 * Thin, defensive wrapper around the Telegram WebApp bridge.
 * The game stays fully playable in a normal desktop browser.
 */
class TelegramBridge {
  constructor() {
    this.tg = window.Telegram?.WebApp || null;
    this.ready = false;
    this.platform = this.tg?.platform || "web";
    this.isTelegram = Boolean(this.tg?.initData !== undefined && this.tg?.initData !== "");
    this.user = this.tg?.initDataUnsafe?.user || null;
    this._forceMobile = null;
    this._forceDesktop = null;
    this._backHandler = null;
    this._closingEnabled = false;
    this._orientationListener = null;
  }

  applyOverrides({ mobile = null, desktop = null } = {}) {
    this._forceMobile = mobile;
    this._forceDesktop = desktop;
  }

  /**
   * The SDK is loaded asynchronously. Refresh the bridge after it appears so
   * Telegram identity and fullscreen APIs are picked up without blocking boot.
   */
  refresh() {
    const next = window.Telegram?.WebApp || null;
    if (this.tg === next && this.ready) return false;
    this.tg = next;
    this.platform = next?.platform || "web";
    this.isTelegram = Boolean(next && next.initData !== undefined && next.initData !== "");
    this.user = next?.initDataUnsafe?.user || null;
    this.ready = false;
    return true;
  }

  get isMobile() {
    if (this._forceMobile === true) return true;
    if (this._forceDesktop === true) return false;
    const platform = String(this.platform || "").toLowerCase();
    if (platform === "android" || platform === "ios") return true;
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent || "");
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    const fine = window.matchMedia?.("(pointer: fine)")?.matches ?? false;
    const narrow = window.innerWidth < 1024;
    // Telegram Web on a phone can report platform "web"; the UA/touch profile
    // still identifies it correctly. Telegram Desktop stays desktop.
    if (this.isTelegram) {
      const tabletTouch = navigator.maxTouchPoints > 1 && coarse && !fine && narrow;
      return uaMobile || tabletTouch;
    }
    return uaMobile || (coarse && !fine && narrow);
  }

  get isTouch() {
    if (this._forceDesktop === true) return false;
    if (this._forceMobile === true) return true;
    return this.isMobile || navigator.maxTouchPoints > 0 || (window.matchMedia?.("(pointer: coarse)")?.matches ?? false);
  }

  get isDesktop() {
    return !this.isMobile;
  }

  get isPortrait() {
    return window.innerHeight > window.innerWidth;
  }

  get name() {
    if (this.user) {
      const name = [this.user.first_name, this.user.last_name].filter(Boolean).join(" ").trim();
      if (name) return name;
      if (this.user.username) return `@${this.user.username}`;
    }
    try {
      const saved = localStorage.getItem("bombman.playerName");
      if (saved) return saved;
    } catch {
      /* ignore */
    }
    return "Игрок";
  }

  get initials() {
    const name = this.name.trim();
    if (!name || name === "Игрок") return "B";
    return name.slice(0, 1).toUpperCase();
  }

  supports(version) {
    if (!this.tg) return false;
    try {
      if (typeof this.tg.isVersionAtLeast === "function") return this.tg.isVersionAtLeast(version);
      return true;
    } catch {
      return false;
    }
  }

  init() {
    if (!this.tg) {
      this.ready = true;
      this._installScreenListeners();
      return;
    }
    try {
      this.tg.ready();
      this.tg.expand?.();
      if (this.supports("6.1")) {
        this.tg.setHeaderColor?.("#060913");
        this.tg.setBackgroundColor?.("#04060d");
      }
      if (this.supports("7.10")) this.tg.setBottomBarColor?.("#04060d");
      if (this.supports("7.7")) this.tg.disableVerticalSwipes?.();
      this.tg.onEvent?.("viewportChanged", () => {
        this._notifyOrientation();
      });
      this.tg.onEvent?.("themeChanged", () => {
        // The game owns its visual theme; keep the header in sync.
        if (this.supports("6.1")) this.tg.setHeaderColor?.("#060913");
      });
      this.ready = true;
    } catch (error) {
      console.warn("Telegram init failed", error);
      this.ready = true;
    }
    this._installScreenListeners();
  }

  _installScreenListeners() {
    this._orientationListener = () => this._notifyOrientation();
    window.addEventListener("orientationchange", this._orientationListener);
    window.addEventListener("resize", this._orientationListener);
  }

  _notifyOrientation() {
    window.dispatchEvent(new CustomEvent("bombman:orientation"));
  }

  async requestFullscreen() {
    // Bot API 8.0+
    try {
      if (this.supports("8.0") && this.tg?.requestFullscreen && !this.tg.isFullscreen) {
        this.tg.requestFullscreen();
      }
    } catch {
      /* optional API */
    }
    if (this.isMobile) {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen({ navigationUI: "hide" });
        }
      } catch {
        /* iOS Safari does not expose this */
      }
      this.lockOrientation();
    }
  }

  async lockOrientation() {
    try {
      if (this.supports("8.0") && this.tg?.lockOrientation) {
        this.tg.lockOrientation();
        return;
      }
    } catch {
      /* Bot API < 8.0 */
    }
    try {
      await screen.orientation?.lock?.("landscape");
    } catch {
      /* orientation lock requires fullscreen and is unsupported on iOS */
    }
  }

  unlockOrientation() {
    try {
      if (this.supports("8.0")) this.tg?.unlockOrientation?.();
    } catch {
      /* optional */
    }
    try {
      screen.orientation?.unlock?.();
    } catch {
      /* optional */
    }
  }

  haptic(type = "light", style = "light") {
    try {
      if (!this.supports("6.1")) {
        if (navigator.vibrate) navigator.vibrate(type === "heavy" ? 24 : 10);
        return;
      }
      const h = this.tg?.HapticFeedback;
      if (!h) {
        if (navigator.vibrate) navigator.vibrate(type === "heavy" ? 24 : 10);
        return;
      }
      if (type === "impact") h.impactOccurred(style);
      else if (type === "notification") h.notificationOccurred(style);
      else h.selectionChanged();
    } catch {
      /* haptics are best-effort */
    }
  }

  success() {
    this.haptic("notification", "success");
  }

  error() {
    this.haptic("notification", "error");
  }

  setClosingConfirmation(enabled) {
    try {
      if (!this.tg || !this.supports("6.2")) return;
      if (enabled && !this._closingEnabled) {
        this.tg.enableClosingConfirmation?.();
        this._closingEnabled = true;
      } else if (!enabled && this._closingEnabled) {
        this.tg.disableClosingConfirmation?.();
        this._closingEnabled = false;
      }
    } catch {
      /* optional */
    }
  }

  setBackButton(handler) {
    try {
      if (!this.tg?.BackButton || !this.supports("6.1")) return;
      const previous = this._backHandler;
      if (previous) this.tg.BackButton.offClick(previous);
      this._backHandler = handler;
      if (handler) {
        this.tg.BackButton.show();
        this.tg.BackButton.onClick(handler);
      } else {
        this.tg.BackButton.hide();
      }
    } catch {
      /* optional */
    }
  }

  openLink(url) {
    try {
      if (this.tg?.openLink) {
        this.tg.openLink(url);
        return;
      }
    } catch {
      /* fallback */
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  share(text, url = window.location.href) {
    try {
      if (this.tg?.openTelegramLink) {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
        this.tg.openTelegramLink(shareUrl);
        return;
      }
    } catch {
      /* fallback */
    }
    if (navigator.share) navigator.share({ title: "BombMan", text, url }).catch(() => {});
    else navigator.clipboard?.writeText(`${text} ${url}`).catch(() => {});
  }
}

export const telegram = new TelegramBridge();
