import { clamp } from "./utils.js";

const KEY_LABELS = {
  Space: "ПРОБЕЛ",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "ESC",
  ShiftLeft: "SHIFT",
  ShiftRight: "SHIFT",
  ControlLeft: "CTRL",
  ControlRight: "CTRL",
  AltLeft: "ALT",
  AltRight: "ALT",
  Enter: "ENTER",
  Tab: "TAB",
  Backspace: "BACKSPACE",
  KeyA: "A",
  KeyB: "B",
  KeyC: "C",
  KeyD: "D",
  KeyE: "E",
  KeyF: "F",
  KeyG: "G",
  KeyH: "H",
  KeyI: "I",
  KeyJ: "J",
  KeyK: "K",
  KeyL: "L",
  KeyM: "M",
  KeyN: "N",
  KeyO: "O",
  KeyP: "P",
  KeyQ: "Q",
  KeyR: "R",
  KeyS: "S",
  KeyT: "T",
  KeyU: "U",
  KeyV: "V",
  KeyW: "W",
  KeyX: "X",
  KeyY: "Y",
  KeyZ: "Z",
  Digit0: "0",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  Digit4: "4",
  Digit5: "5",
  Digit6: "6",
  Digit7: "7",
  Digit8: "8",
  Digit9: "9",
  F1: "F1",
  F2: "F2",
  F3: "F3",
  F4: "F4",
  F5: "F5",
  F6: "F6",
  F7: "F7",
  F8: "F8",
  F9: "F9",
  F10: "F10",
  F11: "F11",
  F12: "F12"
};

export function keyLabel(code) {
  return KEY_LABELS[code] || String(code || "").replace(/^Key|^Digit/, "") || "—";
}

export class InputManager {
  constructor(bindings) {
    this.bindings = bindings;
    this.keys = new Set();
    this.enabled = false;
    this.onCommand = null;
    this.onPause = null;
    this.onCaptureComplete = null;
    this.captureMode = false;
    this.captureFilter = null;
    this.joystick = { x: 0, y: 0, active: false, pointerId: null };
    this._base = null;
    this._knob = null;
    this._baseRect = null;
    this._url = null;
    this._pointerMoveHandler = null;
    this._pointerUpHandler = null;
    this._lastTap = new Map();
    this._onKeyDown = this.#handleKeyDown.bind(this);
    this._onKeyUp = this.#handleKeyUp.bind(this);
    this._onBlur = () => this.reset();
  }

  attach() {
    window.addEventListener("keydown", this._onKeyDown, { passive: false });
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", this._onBlur);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    });
  }

  setBindings(bindings) {
    this.bindings = bindings;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.reset();
  }

  reset() {
    this.keys.clear();
    this.joystick.x = 0;
    this.joystick.y = 0;
    this.joystick.active = false;
    this.joystick.pointerId = null;
    if (this._base) this._base.classList.remove("is-active");
    if (this._knob) this._knob.style.transform = "translate(-50%, -50%)";
  }

  #findBinding(code) {
    if (!code) return null;
    for (const player of ["p1", "p2"]) {
      for (const [action, boundCode] of Object.entries(this.bindings[player] || {})) {
        if (boundCode && boundCode === code) return { player, action };
      }
    }
    return null;
  }

  #handleKeyDown(event) {
    if (this.captureMode) {
      if (event.code === "Escape") {
        event.preventDefault();
        const callback = this.onCaptureComplete;
        this.cancelCapture();
        callback?.(null);
        return;
      }
      if (this.captureFilter && !this.captureFilter(event)) return;
      event.preventDefault();
      const code = event.code;
      const callback = this.onCaptureComplete;
      this.cancelCapture();
      callback?.(code);
      return;
    }

    if (event.code === "Escape") {
      if (this.onPause) {
        event.preventDefault();
        this.onPause();
      }
      return;
    }

    if (!this.enabled) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
      return;
    }
    const binding = this.#findBinding(event.code);
    if (!binding) return;
    event.preventDefault();
    if (event.repeat) return;
    this.keys.add(event.code);
    const { player, action } = binding;
    if (["up", "down", "left", "right"].includes(action)) return;
    this.onCommand?.({
      type: action,
      player: player === "p1" ? 0 : 1,
      source: "keyboard",
      code: event.code
    });
  }

  #handleKeyUp(event) {
    this.keys.delete(event.code);
  }

  getMoveVector(playerIndex = 0) {
    if (!this.enabled) return { x: 0, y: 0 };
    const prefix = playerIndex === 0 ? "p1" : "p2";
    const keys = this.bindings[prefix];
    let x = 0;
    let y = 0;
    if (this.keys.has(keys.left)) x -= 1;
    if (this.keys.has(keys.right)) x += 1;
    if (this.keys.has(keys.up)) y -= 1;
    if (this.keys.has(keys.down)) y += 1;
    if (playerIndex === 0 && this.joystick.active && Math.hypot(this.joystick.x, this.joystick.y) > 0.12) {
      x = this.joystick.x;
      y = this.joystick.y;
    }
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (ax < 0.12 && ay < 0.12) return { x: 0, y: 0 };
    // Bomberman movement is cardinal: use the dominant axis for keyboard and
    // touch, with a small bias toward the most recent joystick direction.
    if (ax >= ay) return { x: Math.sign(x), y: 0 };
    return { x: 0, y: Math.sign(y) };
  }

  bindJoystick(baseElement, knobElement) {
    if (!baseElement || !knobElement) return;
    this._base = baseElement;
    this._knob = knobElement;
    const onDown = (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      this.joystick.pointerId = event.pointerId;
      this.joystick.active = true;
      this._baseRect = baseElement.getBoundingClientRect();
      baseElement.classList.add("is-active");
      try {
        baseElement.setPointerCapture?.(event.pointerId);
      } catch {
        /* noop */
      }
      this.#updateJoystick(event.clientX, event.clientY);
    };
    const onMove = (event) => {
      if (!this.enabled || !this.joystick.active || event.pointerId !== this.joystick.pointerId) return;
      event.preventDefault();
      this.#updateJoystick(event.clientX, event.clientY);
    };
    const onUp = (event) => {
      if (event.pointerId !== this.joystick.pointerId && this.joystick.pointerId !== null) return;
      this.joystick.active = false;
      this.joystick.pointerId = null;
      this.joystick.x = 0;
      this.joystick.y = 0;
      baseElement.classList.remove("is-active");
      knobElement.style.transform = "translate(-50%, -50%)";
    };
    baseElement.addEventListener("pointerdown", onDown, { passive: false });
    baseElement.addEventListener("pointermove", onMove, { passive: false });
    baseElement.addEventListener("pointerup", onUp);
    baseElement.addEventListener("pointercancel", onUp);
    baseElement.addEventListener("lostpointercapture", onUp);

    // Keep a way to remove these handlers if the app ever hot-reloads.
    this._url = { onDown, onMove, onUp };
  }

  #updateJoystick(clientX, clientY) {
    if (!this._baseRect || !this._base) return;
    const cx = this._baseRect.left + this._baseRect.width / 2;
    const cy = this._baseRect.top + this._baseRect.height / 2;
    const maxRadius = this._baseRect.width * 0.3;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const length = Math.hypot(dx, dy);
    if (length > maxRadius) {
      dx = (dx / length) * maxRadius;
      dy = (dy / length) * maxRadius;
    }
    const nx = dx / maxRadius;
    const ny = dy / maxRadius;
    const deadzone = 0.16;
    if (Math.hypot(nx, ny) < deadzone) {
      this.joystick.x = 0;
      this.joystick.y = 0;
    } else {
      this.joystick.x = nx;
      this.joystick.y = ny;
    }
    this._knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  captureNextKey(callback, filter = null) {
    this.captureMode = true;
    this.captureFilter = filter;
    this.onCaptureComplete = (code) => {
      this.onCaptureComplete = null;
      callback(code);
    };
  }

  cancelCapture() {
    this.captureMode = false;
    this.captureFilter = null;
    this.onCaptureComplete = null;
  }

  isListening() {
    return this.captureMode;
  }

  /** Used by on-screen action buttons. */
  trigger(command, player = 0, source = "touch") {
    if (!this.enabled) return;
    this.onCommand?.({
      type: command,
      player,
      source,
      code: `virtual:${command}`
    });
  }
}

export function installButtonFeedback(button, input, callback) {
  if (!button) return;
  const handler = (event) => {
    event.preventDefault();
    button.classList.add("is-pressed");
    setTimeout(() => button.classList.remove("is-pressed"), 90);
    callback?.(event);
  };
  button.addEventListener("pointerdown", handler, { passive: false });
  button.addEventListener("click", (event) => {
    // Keyboard activation (Enter/Space) on the focused button.
    if (event.detail === 0) handler(event);
  });
}
