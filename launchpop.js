/*!
 * launchpop.js
 * Popup trigger library with accessibility, limits, breakpoints & events
 */

(function (root, factory) {
  if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = factory();
  } else {
    root.launchpop = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Utilities & constants
  // ---------------------------------------------------------------------------

  const STORAGE_PREFIX = "launchpop_";
  const LS_KEY_LAST_SHOWN = STORAGE_PREFIX + "lastShown_";
  const SS_KEY_SESSION_COUNT = STORAGE_PREFIX + "sessionCount_";

  // For instances without explicit id, they share this ID for limits.
  const DEFAULT_ID = "launchpop_default";

  function nowMs() {
    return Date.now();
  }

  function minutesToMs(minutes) {
    return minutes * 60 * 1000;
  }

  function safeParseInt(value, fallback = null) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function safeParseBool(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") return fallback;
    const v = value.toLowerCase().trim();
    if (v === "true") return true;
    if (v === "false") return false;
    return fallback;
  }

  function getLocalStorage() {
    try {
      return window.localStorage;
    } catch (e) {
      return null;
    }
  }

  function getSessionStorage() {
    try {
      return window.sessionStorage;
    } catch (e) {
      return null;
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getFocusableElements(container) {
    if (!container) return [];
    const selectors = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ];
    return Array.prototype.slice.call(
      container.querySelectorAll(selectors.join(","))
    );
  }

   function getFooterElement(footerSelector) {
    if (typeof document === "undefined") return null;

    if(footerSelector) {
      const el = document.querySelector(footerSelector);
      if (el) return el;
      // fall through to default footer if none matched
    }
    if(globalOptions.footerSelector && globalOptions.footerSelector != footerSelector) {
      footerSelector = globalOptions.footerSelector;
      const el = document.querySelector(footerSelector);
      if (el) return el;
      // fall through to footer element
    }
    return footerSelector == "footer"? null : document.querySelector("footer");
  }

  // ---------------------------------------------------------------------------
  // Global options & breakpoints
  // ---------------------------------------------------------------------------

  const globalOptions = {
    autoAttachTriggers: false,
    footerSelector: 'footer',
    breakpoints: {
      // small: < 768px
      // medium: 768–1199px
      // large: >= 1200px
      smallMax: 767,
      mediumMax: 1199
    }
  };

  function getCurrentSizeLabel() {
    if (typeof window === "undefined") return "large";
    const width =
      window.innerWidth ||
      (typeof document !== "undefined" &&
        (document.documentElement.clientWidth ||
          (document.body && document.body.clientWidth))) ||
      1200;

    if (width <= globalOptions.breakpoints.smallMax) return "small";
    if (width <= globalOptions.breakpoints.mediumMax) return "medium";
    return "large";
  }

  // ---------------------------------------------------------------------------
  // Shared scroll state
  // ---------------------------------------------------------------------------

  const ScrollState = {
    scrollTop: 0,
    viewportHeight: 0,
    docHeight: 0,
    initialized: false,
    listenersAttached: false,
    popups: new Set()
  };

  function updateScrollState() {
    if (typeof document === "undefined") return;
    const docEl = document.documentElement;
    ScrollState.scrollTop =
      window.pageYOffset || docEl.scrollTop || document.body.scrollTop || 0;
    ScrollState.viewportHeight =
      window.innerHeight || docEl.clientHeight || document.body.clientHeight || 0;
    ScrollState.docHeight =
      Math.max(
        docEl.scrollHeight,
        docEl.offsetHeight,
        document.body ? document.body.scrollHeight : 0,
        document.body ? document.body.offsetHeight : 0
      ) || 0;
    ScrollState.initialized = true;
  }

  function onGlobalScroll(evt) {
    updateScrollState();
    ScrollState.popups.forEach((popup) => popup.handleScroll(ScrollState, evt));
  }

  function ensureScrollListeners() {
    if (ScrollState.listenersAttached || typeof window === "undefined") return;
    ScrollState.listenersAttached = true;
    updateScrollState();
    window.addEventListener("scroll", onGlobalScroll, { passive: true });
  }

  function maybeDetachScrollListeners() {
    if (!ScrollState.listenersAttached || typeof window === "undefined") return;
    if (ScrollState.popups.size === 0) {
      window.removeEventListener("scroll", onGlobalScroll);
      ScrollState.listenersAttached = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Exit-intent manager
  // ---------------------------------------------------------------------------

  const ExitIntentManager = {
    enabledPopups: new Set(),
    listenerAttached: false,
    _boundHandler: null,
    handleMouseOut(event) {
      if (!event.relatedTarget && event.clientY <= 0) {
        this.enabledPopups.forEach((popup) => popup.handleExitIntent(event));
      }
    },
    ensureListener() {
      if (this.listenerAttached || typeof document === "undefined") return;
      this.listenerAttached = true;
      this._boundHandler = this.handleMouseOut.bind(this);
      document.addEventListener("mouseout", this._boundHandler, false);
    },
    maybeDetach() {
      if (!this.listenerAttached || typeof document === "undefined") return;
      if (this.enabledPopups.size === 0) {
        document.removeEventListener("mouseout", this._boundHandler, false);
        this.listenerAttached = false;
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Inactivity manager (user idle trigger)
  // ---------------------------------------------------------------------------

  const InactivityManager = {
    popups: new Set(),
    listenerAttached: false,
    timerId: null,
    lastActivity: nowMs(),
    _boundActivityHandler: null,
    activityHandler() {
      this.lastActivity = nowMs();
    },
    ensureListeners() {
      if (this.listenerAttached || typeof window === "undefined") return;
      this.listenerAttached = true;

      this._boundActivityHandler = this.activityHandler.bind(this);

      ["mousemove", "keydown", "scroll", "touchstart"].forEach((evt) => {
        window.addEventListener(evt, this._boundActivityHandler, { passive: true });
      });

      this.timerId = window.setInterval(() => {
        const now = nowMs();
        this.popups.forEach((popup) => {
          if (
            !popup.shown &&
            !popup.blockedByFrequencyCap &&
            !popup.triggerState.inactivity &&
            popup.inactivityMs != null &&
            now - this.lastActivity >= popup.inactivityMs
          ) {
            popup.triggerState.inactivity = true;
            popup._lastTriggerContext = {
              trigger: "inactivity",
              nativeEvent: null,
              source: "auto"
            };
            popup.tryShow();
          }
        });
      }, 1000);
    },
    maybeDetach() {
      if (!this.listenerAttached || typeof window === "undefined") return;
      if (this.popups.size === 0) {
        ["mousemove", "keydown", "scroll", "touchstart"].forEach((evt) => {
          window.removeEventListener(evt, this._boundActivityHandler, {
            passive: true
          });
        });
        window.clearInterval(this.timerId);
        this.timerId = null;
        this.listenerAttached = false;
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Global state for launchpop
  // ---------------------------------------------------------------------------

  const instances = [];
  let globalDisabled = false;
  let activeInstance = null;

  function removeInstance(instance) {
    const idx = instances.indexOf(instance);
    if (idx !== -1) {
      instances.splice(idx, 1);
    }
  }

  const globalEventListeners = {
    show: [],
    hide: []
  };

  // ---------------------------------------------------------------------------
  // LaunchPopInstance
  // ---------------------------------------------------------------------------

  class LaunchPopInstance {
    constructor(config) {
      this.id = config.id || DEFAULT_ID;
      this.element = config.element;
      this.triggersConfig = config.triggers || {};
      this.limits = config.limits || {}; // { minutes, max, breakpoints }
      this.footerSelector = config.footerSelector || null;

      // Accessibility config
      this.role = config.role || "dialog";
      this.closeOnEsc = config.closeOnEsc !== false; // default true

      // Internal state
      this.shown = false;
      this.blockedByFrequencyCap = false;
      this.disabled = false;

      this.triggerState = {
        scrollPercent: !("scroll_percent" in this.triggersConfig),
        scrollPixels: !("scroll_pixels" in this.triggersConfig),
        delay: !("delay_seconds" in this.triggersConfig),
        exitIntent: !this.triggersConfig.exit_intent,
        inactivity: !("inactivity_seconds" in this.triggersConfig)
      };

      this.scrollPercentThreshold = null;
      this.scrollPixelsThreshold = null;
      this.inactivityMs = null;
      this._delayTimeoutId = null;
      this._lastActiveElement = null;
      this._keydownHandler = null;

      this._clickTargets = [];
      this._clickHandler = null;
      this._boundCloseHandler = null;
      this._lastTriggerContext = null;

      // Per-instance event listeners
      this._listeners = {
        show: [],
        hide: []
      };

      // Wire config.onShow / onHide into listeners directly
      if (typeof config.onShow === "function") {
        this._listeners.show.push(config.onShow);
      };
      if (typeof config.onHide === "function") {
        this._listeners.hide.push(config.onHide);
      }

      this._initAccessibility();
      this._setupTriggers();

      // If there are no auto triggers and no explicit click trigger,
      // try to show immediately (still respects limits & breakpoints).
      const hasAutoTrigger =
        this.triggersConfig.scroll_percent != null ||
        this.triggersConfig.scroll_pixels != null ||
        this.triggersConfig.delay_seconds != null ||
        this.triggersConfig.exit_intent ||
        this.triggersConfig.inactivity_seconds != null;

      const hasClickTrigger = !!this.triggersConfig.click_selector;

      if (!hasAutoTrigger && !hasClickTrigger) {
        this._lastTriggerContext = {
          trigger: "immediate",
          nativeEvent: null,
          source: "auto"
        };
        this.tryShow();
      }

      if (globalDisabled) {
        this.disable();
      }
    }

    // -----------------------------------------------------------------------
    // Event system (instance-level)
    // -----------------------------------------------------------------------

    on(eventName, handler) {
      if (!eventName || typeof handler !== "function") return this;
      if (!this._listeners[eventName]) {
        this._listeners[eventName] = [];
      }
      this._listeners[eventName].push(handler);
      return this;
    }

    off(eventName, handler) {
      if (!eventName || !this._listeners[eventName]) return this;
      if (!handler) {
        this._listeners[eventName] = [];
        return this;
      }
      this._listeners[eventName] = this._listeners[eventName].filter(
        (fn) => fn !== handler
      );
      return this;
    }

    _emit(eventName, context) {
      const payload = {
        type: eventName,
        instance: this,
        trigger: (context && context.trigger) || null,
        nativeEvent: (context && context.nativeEvent) || null,
        timestamp: nowMs(),
        context: context || null
      };

      const local = this._listeners[eventName] || [];
      local.forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          console.error("[launchpop] instance listener error:", e);
        }
      });

      const global = globalEventListeners[eventName] || [];
      global.forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          console.error("[launchpop] global listener error:", e);
        }
      });
    }

    // -----------------------------------------------------------------------
    // Internal setup
    // -----------------------------------------------------------------------

    _getLocalStorageKey() {
      return LS_KEY_LAST_SHOWN + this.id;
    }

    _getSessionStorageKey() {
      return SS_KEY_SESSION_COUNT + this.id;
    }

    _initAccessibility() {
      if (!this.element) return;

      if (!this.element.hasAttribute("data-launchpop-visible")) {
        this.element.setAttribute("aria-hidden", "true");
      }
      if (!this.element.getAttribute("role")) {
        this.element.setAttribute("role", this.role);
      }
      if (!this.element.hasAttribute("aria-modal")) {
        this.element.setAttribute("aria-modal", "true");
      }
    }

    _setupTriggers() {
      if (!this.element) return;

      // Scroll-based triggers
      const needsScroll =
        this.triggersConfig.scroll_percent != null ||
        this.triggersConfig.scroll_pixels != null ||
        this.triggersConfig.scroll_relative_to_footer != null;

      if (needsScroll) {
        this._computeScrollThresholds();
        ScrollState.popups.add(this);
        ensureScrollListeners();
      }

      // Delay-based trigger
      if (this.triggersConfig.delay_seconds != null) {
        const seconds = clamp(
          Number(this.triggersConfig.delay_seconds) || 0,
          0,
          120
        );
        this._delayTimeoutId = setTimeout(() => {
          if (this.disabled || globalDisabled) return;
          this.triggerState.delay = true;
          this._lastTriggerContext = {
            trigger: "delay",
            nativeEvent: null,
            source: "auto"
          };
          this.tryShow();
        }, seconds * 1000);
      }

      // Exit-intent trigger
      if (this.triggersConfig.exit_intent) {
        ExitIntentManager.enabledPopups.add(this);
        ExitIntentManager.ensureListener();
      }

      // Inactivity trigger
      if (this.triggersConfig.inactivity_seconds != null) {
        const seconds = clamp(
          Number(this.triggersConfig.inactivity_seconds) || 0,
          0,
          1800
        );
        this.inactivityMs = seconds * 1000;
        InactivityManager.popups.add(this);
        InactivityManager.ensureListeners();
      }

      // Click trigger via selector
      if (this.triggersConfig.click_selector) {
        this._setupClickTrigger(this.triggersConfig.click_selector);
      }

      // Close buttons
      this._attachCloseHandlers();
    }

    _attachCloseHandlers() {
      if (!this.element || this._boundCloseHandler) return;

      this._boundCloseHandler = (e) => {
        const target = e.target;
        if (target && target.closest && target.closest("[data-launchpop-close]")) {
          this.hide({
            trigger: "close-button",
            nativeEvent: e,
            source: "dom"
          });
        }
      };
      this.element.addEventListener("click", this._boundCloseHandler);
    }

    _detachCloseHandlers() {
      if (!this.element || !this._boundCloseHandler) return;
      this.element.removeEventListener("click", this._boundCloseHandler);
      this._boundCloseHandler = null;
    }

    _ensureClickHandler() {
      if (this._clickHandler) return;

      this._clickHandler = (e) => {
        if (this.disabled || globalDisabled) return;
        e.preventDefault();

        const context = {
          trigger: "click",
          nativeEvent: e,
          source: "dom"
        };

        // Click should bypass frequency limits, but still respect breakpoint limits.
        if (!this._passesBreakpointLimits()) {
          return;
        }

        this.show(context);
      };
    }

    _attachClickTargets(targets) {
      if (!targets || !targets.length) return;
      this._ensureClickHandler();
      targets.forEach((el) => {
        if (this._clickTargets.indexOf(el) !== -1) return;
        el.addEventListener("click", this._clickHandler);
        this._clickTargets.push(el);
      });
    }

    _detachClickTriggers() {
      if (!this._clickHandler || !this._clickTargets.length) return;
      this._clickTargets.forEach((el) => {
        el.removeEventListener("click", this._clickHandler);
      });
      this._clickTargets = [];
      this._clickHandler = null;
    }

    _setupClickTrigger(selector) {
      if (typeof document === "undefined") return;
      const targets = Array.prototype.slice.call(
        document.querySelectorAll(selector)
      );
      if (!targets.length) return;
      this._attachClickTargets(targets);
    }

    // Called by autoAttachTriggers to bind specific elements
    attachClickElement(el) {
      if (!el) return;
      this._attachClickTargets([el]);
    }

    _computeScrollThresholds() {
      if (!ScrollState.initialized) {
        updateScrollState();
      }

      const footerEl = getFooterElement(this.footerSelector);
      const scrollRelativeToFooter = !!this.triggersConfig.scroll_relative_to_footer;

      let referenceScrollableHeight;
      if (scrollRelativeToFooter && footerEl) {
        const rect = footerEl.getBoundingClientRect();
        const footerTop = rect.top + ScrollState.scrollTop;
        referenceScrollableHeight = Math.max(
          0,
          footerTop - ScrollState.viewportHeight
        );
      } else {
        referenceScrollableHeight = Math.max(
          0,
          ScrollState.docHeight - ScrollState.viewportHeight
        );
      }

      if (this.triggersConfig.scroll_percent != null) {
        const pct = clamp(
          Number(this.triggersConfig.scroll_percent) || 0,
          0,
          100
        );
        this.scrollPercentThreshold = (pct / 100) * referenceScrollableHeight;
      }

      if (this.triggersConfig.scroll_pixels != null) {
        let px = Number(this.triggersConfig.scroll_pixels) || 0;
        px = clamp(px, 0, 3000);
        this.scrollPixelsThreshold = Math.min(px, referenceScrollableHeight);
      }
    }

    // -----------------------------------------------------------------------
    // Trigger handlers
    // -----------------------------------------------------------------------

    handleScroll(scrollState, nativeEvent) {
      if (
        this.shown ||
        this.blockedByFrequencyCap ||
        this.disabled ||
        globalDisabled
      ) {
        return;
      }

      const y = scrollState.scrollTop;
      let changed = false;

      if (
        this.scrollPercentThreshold != null &&
        !this.triggerState.scrollPercent &&
        y >= this.scrollPercentThreshold
      ) {
        this.triggerState.scrollPercent = true;
        changed = true;
      }

      if (
        this.scrollPixelsThreshold != null &&
        !this.triggerState.scrollPixels &&
        y >= this.scrollPixelsThreshold
      ) {
        this.triggerState.scrollPixels = true;
        changed = true;
      }

      if (changed) {
        this._lastTriggerContext = {
          trigger: "scroll",
          nativeEvent: nativeEvent || null,
          source: "auto"
        };
      }

      this.tryShow();
    }

    handleExitIntent(event) {
      if (
        this.shown ||
        this.blockedByFrequencyCap ||
        this.disabled ||
        globalDisabled
      ) {
        return;
      }

      if (this.triggersConfig.exit_intent) {
        this.triggerState.exitIntent = true;
        this._lastTriggerContext = {
          trigger: "exit_intent",
          nativeEvent: event || null,
          source: "auto"
        };
        this.tryShow();
      }
    }

    // -----------------------------------------------------------------------
    // Limits (minutes, max, breakpoints)
    // -----------------------------------------------------------------------

    _passesMinutesLimit() {
      const minutesLimit = Number(this.limits && this.limits.minutes);
      if (!minutesLimit || minutesLimit <= 0) return true;

      const ls = getLocalStorage();
      if (!ls) return true;

      const key = this._getLocalStorageKey();
      const last = safeParseInt(ls.getItem(key), null);
      if (!last) return true;

      const elapsed = nowMs() - last;
      return elapsed >= minutesToMs(minutesLimit);
    }

    _passesMaxLimit() {
      const maxLimit = Number(this.limits && this.limits.max);
      if (!maxLimit || maxLimit <= 0) return true;

      const ss = getSessionStorage();
      if (!ss) return true;

      const key = this._getSessionStorageKey();
      const count = safeParseInt(ss.getItem(key), 0);
      return count < maxLimit;
    }

    _incrementFrequencyCounters() {
      const ls = getLocalStorage();
      if (ls && this.limits && "minutes" in this.limits) {
        ls.setItem(this._getLocalStorageKey(), String(nowMs()));
      }

      const ss = getSessionStorage();
      if (ss && this.limits && "max" in this.limits) {
        const key = this._getSessionStorageKey();
        const count = safeParseInt(ss.getItem(key), 0);
        ss.setItem(key, String(count + 1));
      }
    }

    _passesBreakpointLimits() {
      const bp = this.limits && this.limits.breakpoints;
      if (!bp) return true;
      if (typeof window === "undefined") return true;

      const size = getCurrentSizeLabel(); // "small" | "medium" | "large"

      if (size === "small" && bp.small === false) return false;
      if (size === "medium" && bp.medium === false) return false;
      if (size === "large" && bp.large === false) return false;

      return true;
    }

    _allAutoTriggersSatisfied() {
      return (
        this.triggerState.scrollPercent &&
        this.triggerState.scrollPixels &&
        this.triggerState.delay &&
        this.triggerState.exitIntent &&
        this.triggerState.inactivity
      );
    }

    _cleanupNonClickTriggers() {
      if (ScrollState.popups.has(this)) {
        ScrollState.popups.delete(this);
        maybeDetachScrollListeners();
      }

      if (ExitIntentManager.enabledPopups.has(this)) {
        ExitIntentManager.enabledPopups.delete(this);
        ExitIntentManager.maybeDetach();
      }

      if (InactivityManager.popups.has(this)) {
        InactivityManager.popups.delete(this);
        InactivityManager.maybeDetach();
      }

      if (this._delayTimeoutId) {
        clearTimeout(this._delayTimeoutId);
        this._delayTimeoutId = null;
      }
    }

    tryShow() {
      if (
        this.shown ||
        this.blockedByFrequencyCap ||
        this.disabled ||
        globalDisabled
      ) {
        return;
      }

      if (!this._allAutoTriggersSatisfied()) return;

      if (!this._passesBreakpointLimits()) {
        this.blockedByFrequencyCap = true;
        this._cleanupNonClickTriggers();
        return;
      }

      if (!this._passesMinutesLimit() || !this._passesMaxLimit()) {
        this.blockedByFrequencyCap = true;
        this._cleanupNonClickTriggers();
        return;
      }

      const context =
        this._lastTriggerContext || {
          trigger: "auto",
          nativeEvent: null,
          source: "auto"
        };

      this.show(context);
    }

    _attachKeydownHandler() {
      if (!this.closeOnEsc || this._keydownHandler || typeof document === "undefined") {
        return;
      }

      this._keydownHandler = (e) => {
        if (this.disabled || globalDisabled) return;
        if (e.key === "Escape" || e.key === "Esc") {
          this.hide({
            trigger: "esc",
            nativeEvent: e,
            source: "keyboard"
          });
          return;
        }

        if (e.key === "Tab") {
          const focusables = getFocusableElements(this.element);
          if (!focusables.length) return;

          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          const active = document.activeElement;

          if (e.shiftKey) {
            if (active === first || !this.element.contains(active)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (active === last || !this.element.contains(active)) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      document.addEventListener("keydown", this._keydownHandler);
    }

    _detachKeydownHandler() {
      if (!this._keydownHandler || typeof document === "undefined") return;
      document.removeEventListener("keydown", this._keydownHandler);
      this._keydownHandler = null;
    }

    // -----------------------------------------------------------------------
    // Public show/hide (with context)
    // -----------------------------------------------------------------------

    show(context) {
      if (!this.element || this.disabled || globalDisabled) return;

      // Prevent multiple popups visible at once
      if (activeInstance && activeInstance !== this) {
        activeInstance.hide({
          trigger: "superseded",
          nativeEvent: context && context.nativeEvent ? context.nativeEvent : null,
          source: "internal"
        });
      }
      activeInstance = this;

      this.shown = true;
      this._incrementFrequencyCounters();
      this._cleanupNonClickTriggers();

      this.element.setAttribute("data-launchpop-visible", "true");
      this.element.setAttribute("aria-hidden", "false");
      this.element.classList.add("launchpop-visible");

      if (typeof document !== "undefined") {
        this._lastActiveElement = document.activeElement;
      }

      const focusables = getFocusableElements(this.element);
      if (focusables.length) {
        focusables[0].focus();
      } else if (this.element.focus) {
        this.element.setAttribute("tabindex", "-1");
        this.element.focus();
      }

      this._attachKeydownHandler();

      this._emit(
        "show",
        context || {
          trigger: "api",
          nativeEvent: null,
          source: "api"
        }
      );
    }

    hide(context) {
      if (!this.element) return;

      this.element.removeAttribute("data-launchpop-visible");
      this.element.setAttribute("aria-hidden", "true");
      this.element.classList.remove("launchpop-visible");

      if (activeInstance === this) {
        activeInstance = null;
      }

      this._detachKeydownHandler();

      if (this._lastActiveElement && this._lastActiveElement.focus) {
        this._lastActiveElement.focus();
      }

      this._emit(
        "hide",
        context || {
          trigger: "api",
          nativeEvent: null,
          source: "api"
        }
      );
    }

    // -----------------------------------------------------------------------
    // Enable / disable / destroy
    // -----------------------------------------------------------------------

    disable() {
      this.disabled = true;
      this._cleanupNonClickTriggers();
      this._detachClickTriggers();
      this._detachCloseHandlers();
      this._detachKeydownHandler();
    }

    restore() {
      if (!this.element) return;
      this.disabled = false;
      this._setupTriggers();
    }

    destroy() {
      this.disable();
      this._listeners.show = [];
      this._listeners.hide = [];
      if (activeInstance === this) {
        activeInstance = null;
      }
      removeInstance(this);
      this.element = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-attach click triggers: data-launchpop-triggers="id"
  // ---------------------------------------------------------------------------

  function autoAttachTriggersFromDom(rootEl) {
    if (typeof document === "undefined") return;
    const root = rootEl || document;
    const triggerEls = root.querySelectorAll("[data-launchpop-triggers]");
    triggerEls.forEach((el) => {
      const id = el.getAttribute("data-launchpop-triggers");
      if (!id) return;
      instances.forEach((inst) => {
        if (inst.id === id) {
          inst.attachClickElement(el);
        }
      });
    });
  }

  function autoAttachTriggersForInstance(instance, rootEl) {
    if (typeof document === "undefined") return;
    const root = rootEl || document;
    const selector = '[data-launchpop-triggers="' + instance.id + '"]';
    const triggerEls = root.querySelectorAll(selector);
    triggerEls.forEach((el) => {
      instance.attachClickElement(el);
    });
  }

  // ---------------------------------------------------------------------------
  // DOM parsing & init
  // ---------------------------------------------------------------------------

  function parseDomElement(el) {
    const id = el.getAttribute("data-launchpop-id") || undefined;

    const scrollPercent = el.getAttribute("data-launchpop-scroll-percent");
    const scrollPixels = el.getAttribute("data-launchpop-scroll-pixels");
    const scrollRelativeToFooter = el.getAttribute(
      "data-launchpop-scroll-relative-to-footer"
    );
    const delaySeconds = el.getAttribute("data-launchpop-delay-seconds");
    const exitIntent = el.getAttribute("data-launchpop-exit-intent");
    const minutesLimit = el.getAttribute("data-launchpop-minutes-limit");
    const maxLimit = el.getAttribute("data-launchpop-max-limit");
    const footerSelector = el.getAttribute("data-launchpop-footer-selector");
    const clickSelector = el.getAttribute("data-launchpop-click-selector");
    const inactivitySeconds = el.getAttribute("data-launchpop-inactivity-seconds");
    const role = el.getAttribute("data-launchpop-role");

    // Responsive breakpoint limits
    const hideOnSmall = el.getAttribute("data-launchpop-hide-small");
    const hideOnMedium = el.getAttribute("data-launchpop-hide-medium");
    const hideOnLarge = el.getAttribute("data-launchpop-hide-large");

    const triggers = {};
    const limits = {};

    if (scrollPercent !== null) {
      triggers.scroll_percent = clamp(
        safeParseInt(scrollPercent, 0),
        0,
        100
      );
    }
    if (scrollPixels !== null) {
      triggers.scroll_pixels = clamp(
        safeParseInt(scrollPixels, 0),
        0,
        3000
      );
    }
    if (scrollRelativeToFooter !== null) {
      triggers.scroll_relative_to_footer = safeParseBool(
        scrollRelativeToFooter,
        false
      );
    }
    if (delaySeconds !== null) {
      triggers.delay_seconds = clamp(
        safeParseInt(delaySeconds, 0),
        0,
        120
      );
    }
    if (exitIntent !== null) {
      triggers.exit_intent = safeParseBool(exitIntent, false);
    }
    if (clickSelector !== null) {
      triggers.click_selector = clickSelector;
    }
    if (inactivitySeconds !== null) {
      triggers.inactivity_seconds = clamp(
        safeParseInt(inactivitySeconds, 0),
        0,
        1800
      );
    }

    if (minutesLimit !== null) {
      limits.minutes = safeParseInt(minutesLimit, 0);
    }
    if (maxLimit !== null) {
      limits.max = safeParseInt(maxLimit, 0);
    }

    if (
      hideOnSmall !== null ||
      hideOnMedium !== null ||
      hideOnLarge !== null
    ) {
      limits.breakpoints = {
        small: !safeParseBool(hideOnSmall, false),
        medium: !safeParseBool(hideOnMedium, false),
        large: !safeParseBool(hideOnLarge, false)
      };
    }

    return {
      id,
      element: el,
      triggers,
      limits,
      footerSelector,
      role: role || undefined
    };
  }

  function initFromDom(rootEl) {
    if (typeof document === "undefined") return;
    const rootNode = rootEl || document;
    const els = rootNode.querySelectorAll("[data-launchpop-id]");
    els.forEach((el) => {
      register(parseDomElement(el));
    });
  }

  // ---------------------------------------------------------------------------
  // Global event API
  // ---------------------------------------------------------------------------

  function onGlobal(eventName, handler) {
    if (!eventName || typeof handler !== "function") return;
    if (!globalEventListeners[eventName]) {
      globalEventListeners[eventName] = [];
    }
    globalEventListeners[eventName].push(handler);
  }

  function offGlobal(eventName, handler) {
    if (!eventName || !globalEventListeners[eventName]) return;
    if (!handler) {
      globalEventListeners[eventName] = [];
      return;
    }
    globalEventListeners[eventName] = globalEventListeners[eventName].filter(
      (fn) => fn !== handler
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function register(config) {
    if (!config || !config.element) {
      console.warn("[launchpop] register() requires an element.");
      return null;
    }
    const instance = new LaunchPopInstance(config);
    instances.push(instance);

    if (globalOptions.autoAttachTriggers) {
      autoAttachTriggersForInstance(instance);
    }

    return instance;
  }

  function init(options) {
    if (typeof document === "undefined") {
      console.warn("[launchpop] init() requires a DOM environment.");
      return;
    }

    const root = options && options.root ? options.root : document;
    globalOptions.autoAttachTriggers = !!(
      options && options.autoAttachTriggers
    );

    if (options && options.breakpoints) {
      const bp = options.breakpoints;
      if (typeof bp.smallMax === "number") {
        globalOptions.breakpoints.smallMax = bp.smallMax;
      }
      if (typeof bp.mediumMax === "number") {
        globalOptions.breakpoints.mediumMax = bp.mediumMax;
      }
    }

    initFromDom(root);
  }

  function disableAll() {
    globalDisabled = true;
    instances.forEach((inst) => {
      if (inst.shown) {
        inst.hide({
          trigger: "global-disable",
          nativeEvent: null,
          source: "api"
        });
      }
      inst.disable();
    });
  }

  function restoreAll() {
    globalDisabled = false;
    instances.forEach((inst) => inst.restore());

    if (globalOptions.autoAttachTriggers) {
      autoAttachTriggersFromDom(
        typeof document !== "undefined" ? document : undefined
      );
    }
  }

  // Expose defaults (globalOptions) in a safe way
  function getDefaults() {
    // shallow clone is sufficient for current shape
    return {
      autoAttachTriggers: globalOptions.autoAttachTriggers,
      footerSelector: globalOptions.footerSelector,
      breakpoints: {
        smallMax: globalOptions.breakpoints.smallMax,
        mediumMax: globalOptions.breakpoints.mediumMax
      }
    };
  }

  function setDefaults(partial) {
    if (!partial || typeof partial !== "object") return;

    if ("autoAttachTriggers" in partial) {
      globalOptions.autoAttachTriggers = !!partial.autoAttachTriggers;
    }

    if("footerSelector" in partial) {
      globalOptions.footerSelector = partial.footerSelector;
    }

    if (partial.breakpoints && typeof partial.breakpoints === "object") {
      const bp = partial.breakpoints;
      if (typeof bp.smallMax === "number") {
        globalOptions.breakpoints.smallMax = bp.smallMax;
      }
      if (typeof bp.mediumMax === "number") {
        globalOptions.breakpoints.mediumMax = bp.mediumMax;
      }
    }
  }

  function shouldAutoInit() {
    if (typeof document === "undefined") return false;

    if (typeof window !== "undefined" && "LAUNCHPOP_AUTO_INIT" in window) {
      return safeParseBool(window.LAUNCHPOP_AUTO_INIT, true);
    }

    const script = document.currentScript;
    if (script && script.hasAttribute("data-launchpop-auto-init")) {
      return safeParseBool(script.getAttribute("data-launchpop-auto-init"), true);
    }

    return true;
  }

  // Auto-init on DOMContentLoaded if script is included in browser
  const autoInitEnabled = shouldAutoInit();
  if (autoInitEnabled && typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        init({});
      });
    } else {
      init({});
    }
  }

  return {
    init,
    register,
    disable: disableAll,
    restore: restoreAll,
    on: onGlobal,
    off: offGlobal,
    getDefaults,
    setDefaults,
    _instances: instances // for debugging/testing
  };
});
