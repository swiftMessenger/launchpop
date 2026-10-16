/*!
 * /launchpop/v1/launchpop.js
 *
 * Opens one dialog from data-launchpop-* attributes or from register().
 *
 * Auto triggers are scroll, delay, exit intent, and idle. "any" opens on the
 * first configured trigger. "all" waits until every configured trigger has
 * happened. An empty or zero value is not a trigger. With no auto trigger and
 * no click selector, the dialog opens on load.
 *
 * A click selector opens immediately. It still respects screen size. It does
 * not wait for the auto triggers, and it is not blocked by the time or
 * view-count limits.
 * Auto triggers open a dialog once. A click can open it again after it closes.
 * Page counts are applied by the template before this script runs.
 *
 * Minutes between shows and maximum shows stay in this browser and are shared
 * by every tab. They are not sent to the server. When the page names a CMS
 * session id, that session is the visit, and every page request extends it.
 * Otherwise the visit lasts until an hour after the last page that loaded
 * this script. Automatic opens honor the limits. A click still opens the
 * popup, unless the screen size excludes it.
 *
 * Scroll percent and scroll distance measure the document. Set
 * launchpop.setDefaults({ scrollSelector: ".main-scroll" }) before init to
 * measure that element instead. A blank selector, or one that matches
 * nothing, keeps the document measurement.
 */

(function (root, factory) {
  if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = factory();
  } else {
    root.launchpop = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STORE_KEY = "launchpop";
  var SESSION_MARK = "launchpop";
  var SESSION_STALE_MS = 60 * 60 * 1000;
  var DEFAULT_ID = "launchpop_default";
  var heartbeatTimer = null;

  // One list owns the auto triggers: config key, upper bound, and event name.
  var AUTO_TRIGGERS = [
    { key: "scroll_percent", max: 100, event: "scroll" },
    { key: "scroll_pixels", max: 3000, event: "scroll" },
    { key: "delay_seconds", max: 120, event: "delay" },
    { key: "exit_intent", flag: true, event: "exit_intent" },
    { key: "inactivity_seconds", max: 1800, event: "inactivity" }
  ];

  var TRIGGER_ATTRIBUTES = {
    "data-launchpop-scroll-percent": "scroll_percent",
    "data-launchpop-scroll-pixels": "scroll_pixels",
    "data-launchpop-scroll-relative-to-footer": "scroll_relative_to_footer",
    "data-launchpop-delay-seconds": "delay_seconds",
    "data-launchpop-exit-intent": "exit_intent",
    "data-launchpop-inactivity-seconds": "inactivity_seconds",
    "data-launchpop-click-selector": "click_selector"
  };

  var globalOptions = {
    autoAttachTriggers: false,
    footerSelector: "footer",
    scrollSelector: "",
    breakpoints: {
      smallMax: 767,
      mediumMax: 1199
    }
  };

  var instances = [];
  var globalDisabled = false;
  var activeInstance = null;
  var globalEvents = createEmitter();

  // -------------------------------------------------------------------------
  // Small helpers
  // -------------------------------------------------------------------------

  function numeric(value) {
    return typeof value === "number" && isFinite(value) ? value : 0;
  }

  function firstNumber(values) {
    for (var i = 0; i < values.length; i++) {
      if (typeof values[i] === "number" && isFinite(values[i])) return values[i];
    }
    return 0;
  }

  function nowMs() {
    return Date.now();
  }

  function minutesToMs(minutes) {
    return minutes * 60 * 1000;
  }

  function positiveInt(value, max) {
    if (value == null || value === "") return null;
    var n = typeof value === "number" ? Math.floor(value) : parseInt(value, 10);
    if (!isFinite(n) || n <= 0) return null;
    if (max == null) return n;
    return Math.min(max, n);
  }

  function isTrue(value) {
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") return false;
    return value.toLowerCase().trim() === "true";
  }

  function storageArea(kind) {
    try {
      if (typeof window === "undefined") return null;
      return window[kind];
    } catch (e) {
      return null;
    }
  }

  function readJson(storage, key) {
    if (!storage) return null;
    try {
      var raw = storage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function writeJson(storage, key, value) {
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // A blocked store should not stop the dialog from opening.
    }
  }

  function blankRecord() {
    return { session: "", last: {}, count: {}, seen: nowMs() };
  }

  function normalizeRecord(parsed) {
    var record = parsed || blankRecord();
    if (!record.last || typeof record.last !== "object") record.last = {};
    if (!record.count || typeof record.count !== "object") record.count = {};
    return record;
  }

  function tabHasJoined(session) {
    if (!session) return false;
    try {
      return session.getItem(SESSION_MARK) === "1";
    } catch (e) {
      return false;
    }
  }

  function markTabJoined(session) {
    if (!session) return;
    try {
      session.setItem(SESSION_MARK, "1");
    } catch (e) {
      // This tab can still read a record another tab kept fresh.
    }
  }

  function startHeartbeat() {
    if (heartbeatTimer != null || typeof window === "undefined" || !window.setInterval) return;
    heartbeatTimer = window.setInterval(function () {
      var local = storageArea("localStorage");
      var record = normalizeRecord(readJson(local, STORE_KEY));
      record.seen = nowMs();
      writeJson(local, STORE_KEY, record);
    }, 20000);
    if (heartbeatTimer && heartbeatTimer.unref) heartbeatTimer.unref();
  }

  function currentSessionId() {
    var el = queryOne("[data-launchpop-session]");
    var id = el && el.getAttribute("data-launchpop-session");
    return id ? String(id) : "";
  }

  // A CMS session id is extended by every page request, including pages that
  // do not show a popup. Without one, a tab that has not joined this visit
  // starts over when nothing has loaded this script for an hour.
  function readSessionRecord() {
    var local = storageArea("localStorage");
    var session = storageArea("sessionStorage");
    if (!local) return blankRecord();

    var record = normalizeRecord(readJson(local, STORE_KEY));
    var sessionId = currentSessionId();
    if (sessionId) {
      if (record.session !== sessionId) {
        record = blankRecord();
        record.session = sessionId;
      }
      record.seen = nowMs();
      writeJson(local, STORE_KEY, record);
      return record;
    }

    if (!tabHasJoined(session)) {
      var seen = positiveInt(record.seen, null);
      if (seen == null || nowMs() - seen >= SESSION_STALE_MS) record = blankRecord();
      markTabJoined(session);
    }
    record.seen = nowMs();
    writeJson(local, STORE_KEY, record);
    startHeartbeat();
    return record;
  }

  function writeSessionRecord(record) {
    var sessionId = currentSessionId();
    if (sessionId) record.session = sessionId;
    record.seen = nowMs();
    writeJson(storageArea("localStorage"), STORE_KEY, record);
    markTabJoined(storageArea("sessionStorage"));
    if (!sessionId) startHeartbeat();
  }

  function query(selector, rootNode) {
    if (!selector || typeof document === "undefined") return [];
    try {
      return Array.prototype.slice.call((rootNode || document).querySelectorAll(selector));
    } catch (e) {
      return [];
    }
  }

  function queryOne(selector) {
    if (!selector || typeof document === "undefined") return null;
    try {
      return document.querySelector(selector);
    } catch (e) {
      return null;
    }
  }

  function findFooter(selector) {
    if (typeof document === "undefined") return null;
    var selectors = [];
    if (selector) selectors.push(selector);
    if (globalOptions.footerSelector && globalOptions.footerSelector !== selector) {
      selectors.push(globalOptions.footerSelector);
    }
    if (selectors.indexOf("footer") === -1) selectors.push("footer");

    for (var i = 0; i < selectors.length; i++) {
      var el = queryOne(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  function viewportWidth() {
    if (typeof window === "undefined") return 1200;
    var docEl = document.documentElement;
    return (
      window.innerWidth ||
      (docEl && docEl.clientWidth) ||
      (document.body && document.body.clientWidth) ||
      1200
    );
  }

  function sizeLabel() {
    var width = viewportWidth();
    if (width <= globalOptions.breakpoints.smallMax) return "small";
    if (width <= globalOptions.breakpoints.mediumMax) return "medium";
    return "large";
  }

  function applyBreakpoints(source) {
    if (!source || typeof source !== "object") return;
    if (typeof source.smallMax === "number") globalOptions.breakpoints.smallMax = source.smallMax;
    if (typeof source.mediumMax === "number") globalOptions.breakpoints.mediumMax = source.mediumMax;
  }

  function getFocusableElements(container) {
    if (!container) return [];
    return query(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      container
    );
  }

  function keepFocusIn(event, container) {
    var focusables = getFocusableElements(container);
    if (!focusables.length || typeof document === "undefined") return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    var active = document.activeElement;
    var backward = event.shiftKey && (active === first || !container.contains(active));
    var forward = !event.shiftKey && (active === last || !container.contains(active));
    if (!backward && !forward) return;
    event.preventDefault();
    (backward ? last : first).focus();
  }

  function createEmitter() {
    var listeners = {};

    function list(eventName) {
      if (!listeners[eventName]) listeners[eventName] = [];
      return listeners[eventName];
    }

    return {
      on: function (eventName, handler) {
        if (!eventName || typeof handler !== "function") return;
        list(eventName).push(handler);
      },
      off: function (eventName, handler) {
        if (!eventName || !listeners[eventName]) return;
        if (!handler) {
          listeners[eventName] = [];
          return;
        }
        listeners[eventName] = listeners[eventName].filter(function (fn) {
          return fn !== handler;
        });
      },
      emit: function (eventName, callHandler) {
        list(eventName).slice().forEach(function (fn) {
          try {
            callHandler(fn);
          } catch (e) {
            console.error("[launchpop] listener error:", e);
          }
        });
      },
      clear: function () {
        listeners = {};
      }
    };
  }

  function createGroup(start, stop) {
    var members = new Set();
    var running = false;

    function sync() {
      if (members.size > 0 && !running) {
        start();
        running = true;
      } else if (members.size === 0 && running) {
        stop();
        running = false;
      }
    }

    return {
      add: function (member, seed) {
        var isNew = !members.has(member);
        members.add(member);
        sync();
        if (isNew && typeof seed === "function") seed(member);
      },
      delete: function (member) {
        members.delete(member);
        sync();
      },
      forEach: function (fn) {
        members.forEach(fn);
      }
    };
  }

  function parseBool(value, fallback) {
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") return fallback;
    var normalized = value.toLowerCase().trim();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return fallback;
  }

  function normalizeTriggers(source) {
    var triggers = {};
    if (!source || typeof source !== "object") return triggers;

    AUTO_TRIGGERS.forEach(function (def) {
      if (!Object.prototype.hasOwnProperty.call(source, def.key)) return;
      if (def.flag) {
        if (isTrue(source[def.key])) triggers[def.key] = true;
        return;
      }
      var value = positiveInt(source[def.key], def.max);
      if (value != null) triggers[def.key] = value;
    });

    if (isTrue(source.scroll_relative_to_footer)) triggers.scroll_relative_to_footer = true;
    if (source.click_selector) triggers.click_selector = String(source.click_selector);
    return triggers;
  }

  function normalizeLimits(source) {
    var limits = {};
    if (!source || typeof source !== "object") return limits;

    var minutes = positiveInt(source.minutes, null);
    var max = positiveInt(source.max, null);
    if (minutes != null) limits.minutes = minutes;
    if (max != null) limits.max = max;

    if (source.breakpoints && typeof source.breakpoints === "object") {
      limits.breakpoints = {
        small: source.breakpoints.small !== false,
        medium: source.breakpoints.medium !== false,
        large: source.breakpoints.large !== false
      };
    }
    return limits;
  }

  // -------------------------------------------------------------------------
  // Shared listeners. Each dialog opts in; the browser listener exists only
  // while at least one dialog still needs it.
  // -------------------------------------------------------------------------

  var scrollState = {
    scrollTop: 0,
    viewportHeight: 0,
    docHeight: 0
  };

  // A site-wide selector overrides the document. A blank selector, or one that
  // matches nothing, keeps measuring the window.
  function scrollElement() {
    var selector = globalOptions.scrollSelector;
    if (typeof selector !== "string" || !selector.trim()) return null;
    return queryOne(selector.trim());
  }

  function updateScrollState() {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    var el = scrollElement();
    scrollState.element = el;
    if (el) {
      scrollState.scrollTop = numeric(el.scrollTop);
      scrollState.viewportHeight = numeric(el.clientHeight);
      scrollState.docHeight = numeric(el.scrollHeight);
      return;
    }
    var docEl = document.documentElement;
    var body = document.body;
    scrollState.scrollTop = firstNumber([
      window.pageYOffset,
      docEl && docEl.scrollTop,
      body && body.scrollTop
    ]);
    scrollState.viewportHeight = firstNumber([
      window.innerHeight,
      docEl && docEl.clientHeight,
      body && body.clientHeight
    ]);
    scrollState.docHeight = Math.max(
      numeric(docEl && docEl.scrollHeight),
      numeric(docEl && docEl.offsetHeight),
      numeric(body && body.scrollHeight),
      numeric(body && body.offsetHeight)
    );
  }

  var scrollListenTarget = null;

  function attachScrollListener() {
    var el = scrollElement();
    scrollListenTarget = el || window;
    scrollListenTarget.addEventListener("scroll", onScroll, { passive: true });
  }

  function detachScrollListener() {
    if (!scrollListenTarget) return;
    scrollListenTarget.removeEventListener("scroll", onScroll);
    scrollListenTarget = null;
  }

  function onScroll(event) {
    updateScrollState();
    scrollGroup.forEach(function (popup) {
      popup.handleScroll(scrollState, event);
    });
  }

  var scrollGroup = createGroup(
    function () {
      if (typeof window === "undefined") return;
      updateScrollState();
      attachScrollListener();
    },
    function () {
      detachScrollListener();
    }
  );

  function onExitMouseOut(event) {
    if (!event || event.relatedTarget || event.clientY > 0) return;
    exitGroup.forEach(function (popup) {
      popup.handleExitIntent(event);
    });
  }

  var exitGroup = createGroup(
    function () {
      if (typeof document === "undefined") return;
      document.addEventListener("mouseout", onExitMouseOut, false);
    },
    function () {
      if (typeof document === "undefined") return;
      document.removeEventListener("mouseout", onExitMouseOut, false);
    }
  );

  var idleLastActivity = nowMs();
  var idleTimer = null;
  var onIdleActivity = null;

  function noteIdleActivity() {
    idleLastActivity = nowMs();
  }

  var idleGroup = createGroup(
    function () {
      if (typeof window === "undefined") return;
      onIdleActivity = noteIdleActivity;
      ["mousemove", "keydown", "scroll", "touchstart"].forEach(function (type) {
        window.addEventListener(type, onIdleActivity, { passive: true });
      });
      idleTimer = window.setInterval(function () {
        var idleFor = nowMs() - idleLastActivity;
        idleGroup.forEach(function (popup) {
          popup.noteInactivity(idleFor);
        });
      }, 1000);
    },
    function () {
      if (typeof window === "undefined" || !onIdleActivity) return;
      ["mousemove", "keydown", "scroll", "touchstart"].forEach(function (type) {
        window.removeEventListener(type, onIdleActivity);
      });
      window.clearInterval(idleTimer);
      idleTimer = null;
      onIdleActivity = null;
    }
  );

  function onResize() {
    resizeGroup.forEach(function (popup) {
      popup.tryShow();
    });
  }

  var resizeGroup = createGroup(
    function () {
      if (typeof window === "undefined") return;
      window.addEventListener("resize", onResize);
    },
    function () {
      if (typeof window === "undefined") return;
      window.removeEventListener("resize", onResize);
    }
  );

  // -------------------------------------------------------------------------
  // Dialog
  // -------------------------------------------------------------------------

  function LaunchPop(config) {
    this.id = config.id || DEFAULT_ID;
    this.element = config.element;
    this.triggers = normalizeTriggers(config.triggers);
    this.limits = normalizeLimits(config.limits);
    this.triggerMode = config.triggerMode === "all" ? "all" : "any";
    this.footerSelector = config.footerSelector || null;
    this.role = config.role || "dialog";
    this.closeOnEsc = config.closeOnEsc !== false;

    this.isOpen = false;
    this.hasOpened = false; // Auto triggers stop after the first open. A click can open again.
    this.disabled = false;
    this._met = {};
    this._delayTimer = null;
    this._lastActiveElement = null;
    this._keydownHandler = null;
    this._clickTargets = [];
    this._clickHandler = null;
    this._closeHandler = null;
    this._lastTriggerContext = null;
    this._events = createEmitter();
    this._percentAt = null;
    this._pixelsAt = null;

    AUTO_TRIGGERS.forEach(function (def) {
      if (Object.prototype.hasOwnProperty.call(this.triggers, def.key)) {
        this._met[def.key] = false;
      }
    }, this);

    if (typeof config.onShow === "function") this._events.on("show", config.onShow);
    if (typeof config.onHide === "function") this._events.on("hide", config.onHide);

    this._prepareElement();
    this._bindUi();
    this._armAutoTriggers();

    if (this._opensOnLoad()) {
      this._lastTriggerContext = { trigger: "immediate", nativeEvent: null, source: "auto" };
      this.tryShow();
    }

    if (globalDisabled) this.disable();
  }

  LaunchPop.prototype.on = function (eventName, handler) {
    this._events.on(eventName, handler);
    return this;
  };

  LaunchPop.prototype.off = function (eventName, handler) {
    this._events.off(eventName, handler);
    return this;
  };

  LaunchPop.prototype._emit = function (eventName, context) {
    var payload = {
      type: eventName,
      instance: this,
      trigger: (context && context.trigger) || null,
      nativeEvent: (context && context.nativeEvent) || null,
      timestamp: nowMs(),
      context: context || null
    };

    this._events.emit(eventName, function (fn) {
      fn(payload);
    });
    globalEvents.emit(eventName, function (fn) {
      fn(payload);
    });
  };

  LaunchPop.prototype._hasAutoTrigger = function () {
    return Object.keys(this._met).length > 0;
  };

  LaunchPop.prototype._opensOnLoad = function () {
    return !this._hasAutoTrigger() && !this.triggers.click_selector;
  };

  LaunchPop.prototype._canAutoOpen = function () {
    return !!(this.element && !this.hasOpened && !this.isOpen && !this.disabled && !globalDisabled);
  };

  LaunchPop.prototype._autoTriggersSatisfied = function () {
    var keys = Object.keys(this._met);
    if (!keys.length) return !this.triggers.click_selector;
    if (this.triggerMode === "all") {
      return keys.every(function (key) {
        return this._met[key];
      }, this);
    }
    return keys.some(function (key) {
      return this._met[key];
    }, this);
  };

  LaunchPop.prototype._mark = function (key, context) {
    if (!Object.prototype.hasOwnProperty.call(this._met, key) || this._met[key]) return;
    this._met[key] = true;
    this._lastTriggerContext = context;
  };

  LaunchPop.prototype._prepareElement = function () {
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
  };

  LaunchPop.prototype._bindUi = function () {
    this._attachCloseHandler();
    if (this.triggers.click_selector) this._setupClickTrigger(this.triggers.click_selector);
  };

  LaunchPop.prototype._armAutoTriggers = function () {
    if (this.hasOpened || this.disabled || !this.element) return;

    if (this.triggers.scroll_percent != null || this.triggers.scroll_pixels != null) {
      scrollGroup.add(this, function (popup) {
        popup.handleScroll(scrollState, null);
      });
    }
    if (this.hasOpened) return;

    if (this.triggers.delay_seconds != null) this._startDelay();
    if (this.triggers.exit_intent) exitGroup.add(this);
    if (this.triggers.inactivity_seconds != null) idleGroup.add(this);
    if (this._hasAutoTrigger() || this._opensOnLoad()) resizeGroup.add(this);
  };

  LaunchPop.prototype._startDelay = function () {
    var self = this;
    if (this._delayTimer != null) return;
    this._delayTimer = setTimeout(function () {
      self._delayTimer = null;
      if (!self._canAutoOpen()) return;
      self._mark("delay_seconds", { trigger: "delay", nativeEvent: null, source: "auto" });
      self.tryShow();
    }, this.triggers.delay_seconds * 1000);
  };

  LaunchPop.prototype._stopAutoTriggers = function () {
    scrollGroup.delete(this);
    exitGroup.delete(this);
    idleGroup.delete(this);
    resizeGroup.delete(this);
    if (this._delayTimer != null) {
      clearTimeout(this._delayTimer);
      this._delayTimer = null;
    }
  };

  LaunchPop.prototype._scrollableDistance = function () {
    updateScrollState();
    var distance = Math.max(0, scrollState.docHeight - scrollState.viewportHeight);
    if (!this.triggers.scroll_relative_to_footer) return distance;

    var footer = findFooter(this.footerSelector);
    if (!footer || !footer.getBoundingClientRect) return distance;
    var footerRect = footer.getBoundingClientRect();
    var el = scrollState.element;
    var footerTop = el && el.getBoundingClientRect
      ? footerRect.top - el.getBoundingClientRect().top + numeric(el.scrollTop)
      : footerRect.top + scrollState.scrollTop;
    return Math.max(0, footerTop - scrollState.viewportHeight);
  };

  LaunchPop.prototype._updateScrollThresholds = function () {
    var distance = this._scrollableDistance();
    this._percentAt = null;
    this._pixelsAt = null;
    if (this.triggers.scroll_percent != null) {
      this._percentAt = (this.triggers.scroll_percent / 100) * distance;
    }
    if (this.triggers.scroll_pixels != null) {
      this._pixelsAt = Math.min(this.triggers.scroll_pixels, distance);
    }
  };

  LaunchPop.prototype.handleScroll = function (state, nativeEvent) {
    if (!this._canAutoOpen()) return;
    this._updateScrollThresholds();
    var y = state.scrollTop;
    var reached = false;

    if (this._percentAt != null && y >= this._percentAt) {
      this._mark("scroll_percent", { trigger: "scroll", nativeEvent: nativeEvent || null, source: "auto" });
      reached = true;
    }
    if (this._pixelsAt != null && y >= this._pixelsAt) {
      this._mark("scroll_pixels", { trigger: "scroll", nativeEvent: nativeEvent || null, source: "auto" });
      reached = true;
    }
    if (reached) this.tryShow();
  };

  LaunchPop.prototype.handleExitIntent = function (event) {
    if (!this._canAutoOpen() || !this.triggers.exit_intent) return;
    this._mark("exit_intent", { trigger: "exit_intent", nativeEvent: event || null, source: "auto" });
    this.tryShow();
  };

  LaunchPop.prototype.noteInactivity = function (idleForMs) {
    if (!this._canAutoOpen() || this.triggers.inactivity_seconds == null) return;
    if (idleForMs < this.triggers.inactivity_seconds * 1000) return;
    this._mark("inactivity_seconds", {
      trigger: "inactivity",
      nativeEvent: null,
      source: "auto"
    });
    this.tryShow();
  };

  LaunchPop.prototype._passesBreakpoint = function () {
    var allowed = this.limits.breakpoints;
    if (!allowed) return true;
    return allowed[sizeLabel()] !== false;
  };

  LaunchPop.prototype._passesMinutes = function () {
    if (this.limits.minutes == null) return true;
    var last = positiveInt(readSessionRecord().last[this.id], null);
    if (last == null) return true;
    return nowMs() - last >= minutesToMs(this.limits.minutes);
  };

  LaunchPop.prototype._passesShownCount = function () {
    if (this.limits.max == null) return true;
    var count = positiveInt(readSessionRecord().count[this.id], null) || 0;
    return count < this.limits.max;
  };

  LaunchPop.prototype._passesLimits = function () {
    return this._passesBreakpoint() && this._passesMinutes() && this._passesShownCount();
  };

  LaunchPop.prototype._recordOpen = function () {
    if (this.limits.minutes == null && this.limits.max == null) return;
    var record = readSessionRecord();
    if (this.limits.minutes != null) record.last[this.id] = nowMs();
    if (this.limits.max != null) {
      record.count[this.id] = (positiveInt(record.count[this.id], null) || 0) + 1;
    }
    writeSessionRecord(record);
  };

  // Auto triggers, resize, and the on-load path come through here.
  LaunchPop.prototype.tryShow = function () {
    if (!this._canAutoOpen()) return;
    if (!this._autoTriggersSatisfied()) return;
    if (!this._passesLimits()) return;
    this.show(this._lastTriggerContext || { trigger: "auto", nativeEvent: null, source: "auto" });
  };

  LaunchPop.prototype._attachCloseHandler = function () {
    if (!this.element || this._closeHandler) return;
    var self = this;
    this._closeHandler = function (event) {
      if (!self.isOpen) return;
      var target = event && event.target;
      var onCloseControl = target && target.closest && target.closest("[data-launchpop-close]");
      if (target !== self.element && !onCloseControl) return;
      self.hide({
        trigger: target === self.element ? "overlay" : "close-button",
        nativeEvent: event,
        source: "dom"
      });
    };
    this.element.addEventListener("click", this._closeHandler);
  };

  LaunchPop.prototype._detachCloseHandler = function () {
    if (!this.element || !this._closeHandler) return;
    this.element.removeEventListener("click", this._closeHandler);
    this._closeHandler = null;
  };

  LaunchPop.prototype._ensureClickHandler = function () {
    if (this._clickHandler) return;
    var self = this;
    this._clickHandler = function (event) {
      if (self.disabled || globalDisabled) return;
      if (self.isOpen) {
        if (event && event.preventDefault) event.preventDefault();
        return;
      }
      if (!self._passesBreakpoint()) return;
      if (event && event.preventDefault) event.preventDefault();
      self.show({ trigger: "click", nativeEvent: event, source: "dom" });
    };
  };

  LaunchPop.prototype._attachClickTargets = function (targets) {
    if (!targets || !targets.length) return;
    this._ensureClickHandler();
    var self = this;
    targets.forEach(function (el) {
      if (!el || self._clickTargets.indexOf(el) !== -1) return;
      el.addEventListener("click", self._clickHandler);
      self._clickTargets.push(el);
    });
  };

  LaunchPop.prototype._detachClickTriggers = function () {
    var self = this;
    if (!this._clickHandler) return;
    this._clickTargets.forEach(function (el) {
      el.removeEventListener("click", self._clickHandler);
    });
    this._clickTargets = [];
    this._clickHandler = null;
  };

  LaunchPop.prototype._setupClickTrigger = function (selector) {
    this._attachClickTargets(query(selector));
  };

  LaunchPop.prototype.attachClickElement = function (el) {
    this._attachClickTargets([el]);
  };

  LaunchPop.prototype._attachKeydown = function () {
    if (!this.closeOnEsc || this._keydownHandler || typeof document === "undefined") return;
    var self = this;
    this._keydownHandler = function (event) {
      if (!self.isOpen || self.disabled || globalDisabled) return;
      if (event.key === "Escape" || event.key === "Esc") {
        self.hide({ trigger: "esc", nativeEvent: event, source: "keyboard" });
        return;
      }
      if (event.key === "Tab") keepFocusIn(event, self.element);
    };
    document.addEventListener("keydown", this._keydownHandler);
  };

  LaunchPop.prototype._detachKeydown = function () {
    if (!this._keydownHandler || typeof document === "undefined") return;
    document.removeEventListener("keydown", this._keydownHandler);
    this._keydownHandler = null;
  };

  // Direct open. Trigger mode and frequency limits are checked by the caller.
  LaunchPop.prototype.show = function (context) {
    if (!this.element || this.disabled || globalDisabled || this.isOpen) return;

    if (activeInstance && activeInstance !== this) {
      activeInstance.hide({
        trigger: "superseded",
        nativeEvent: context && context.nativeEvent ? context.nativeEvent : null,
        source: "internal"
      });
    }

    activeInstance = this;
    this.isOpen = true;
    this.hasOpened = true;
    this._recordOpen();
    this._stopAutoTriggers();

    this.element.setAttribute("data-launchpop-visible", "true");
    this.element.setAttribute("aria-hidden", "false");
    this.element.classList.add("launchpop-visible");

    if (typeof document !== "undefined") this._lastActiveElement = document.activeElement;

    var focusables = getFocusableElements(this.element);
    if (focusables.length) {
      focusables[0].focus();
    } else if (this.element.focus) {
      this.element.setAttribute("tabindex", "-1");
      this.element.focus();
    }

    this._attachKeydown();
    this._emit("show", context || { trigger: "api", nativeEvent: null, source: "api" });
  };

  LaunchPop.prototype.hide = function (context) {
    if (!this.element || !this.isOpen) return;

    this.isOpen = false;
    this.element.removeAttribute("data-launchpop-visible");
    this.element.setAttribute("aria-hidden", "true");
    this.element.classList.remove("launchpop-visible");

    if (activeInstance === this) activeInstance = null;
    this._detachKeydown();

    var previous = this._lastActiveElement;
    this._lastActiveElement = null;
    if (previous && previous.focus) {
      try {
        previous.focus();
      } catch (e) {
        // The previously focused node may already be gone.
      }
    }

    this._emit("hide", context || { trigger: "api", nativeEvent: null, source: "api" });
  };

  LaunchPop.prototype.disable = function () {
    this.disabled = true;
    this._stopAutoTriggers();
    this._detachClickTriggers();
    this._detachCloseHandler();
    this._detachKeydown();
  };

  LaunchPop.prototype.restore = function () {
    if (!this.element) return;
    this.disabled = false;
    this._bindUi();
    this._armAutoTriggers();
  };

  LaunchPop.prototype.destroy = function () {
    this.disable();
    this._events.clear();
    if (activeInstance === this) activeInstance = null;
    var index = instances.indexOf(this);
    if (index !== -1) instances.splice(index, 1);
    this.element = null;
  };

  // -------------------------------------------------------------------------
  // DOM
  // -------------------------------------------------------------------------

  function hideBreakpoints(el) {
    var names = ["small", "medium", "large"];
    var present = false;
    var allowed = {};
    names.forEach(function (name) {
      var attr = "data-launchpop-hide-" + name;
      if (!el.hasAttribute(attr)) {
        allowed[name] = true;
        return;
      }
      present = true;
      allowed[name] = !isTrue(el.getAttribute(attr));
    });
    return present ? allowed : null;
  }

  function readTriggers(el) {
    var raw = {};
    Object.keys(TRIGGER_ATTRIBUTES).forEach(function (attr) {
      if (el.hasAttribute(attr)) raw[TRIGGER_ATTRIBUTES[attr]] = el.getAttribute(attr);
    });
    return raw;
  }

  function readLimits(el) {
    var raw = {};
    if (el.hasAttribute("data-launchpop-minutes-limit")) {
      raw.minutes = el.getAttribute("data-launchpop-minutes-limit");
    }
    if (el.hasAttribute("data-launchpop-max-limit")) {
      raw.max = el.getAttribute("data-launchpop-max-limit");
    }
    var breakpoints = hideBreakpoints(el);
    if (breakpoints) raw.breakpoints = breakpoints;
    return raw;
  }

  function parseDomElement(el) {
    return {
      id: el.getAttribute("data-launchpop-id") || undefined,
      element: el,
      triggerMode: el.getAttribute("data-launchpop-trigger-mode") === "all" ? "all" : "any",
      triggers: readTriggers(el),
      limits: readLimits(el),
      footerSelector: el.getAttribute("data-launchpop-footer-selector"),
      role: el.getAttribute("data-launchpop-role") || undefined
    };
  }

  function attributeEqualsSelector(name, value) {
    return "[" + name + "=\"" + String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"]";
  }

  function attachTriggersFor(instance, rootNode) {
    query(attributeEqualsSelector("data-launchpop-triggers", instance.id), rootNode).forEach(function (el) {
      instance.attachClickElement(el);
    });
  }

  function attachTriggersIn(rootNode) {
    query("[data-launchpop-triggers]", rootNode).forEach(function (el) {
      var id = el.getAttribute("data-launchpop-triggers");
      if (!id) return;
      instances.forEach(function (instance) {
        if (instance.id === id) instance.attachClickElement(el);
      });
    });
  }

  function register(config) {
    if (!config || !config.element) {
      console.warn("[launchpop] register() requires an element.");
      return null;
    }
    var instance = new LaunchPop(config);
    instances.push(instance);
    if (globalOptions.autoAttachTriggers) attachTriggersFor(instance);
    return instance;
  }

  function initFromDom(rootNode) {
    query("[data-launchpop-id]", rootNode).forEach(function (el) {
      register(parseDomElement(el));
    });
  }

  function init(options) {
    if (typeof document === "undefined") {
      console.warn("[launchpop] init() requires a DOM environment.");
      return;
    }

    var rootNode = options && options.root ? options.root : document;
    globalOptions.autoAttachTriggers = !!(options && options.autoAttachTriggers);
    if (options && options.breakpoints) applyBreakpoints(options.breakpoints);
    initFromDom(rootNode);
  }

  function disableAll() {
    globalDisabled = true;
    instances.slice().forEach(function (instance) {
      if (instance.isOpen) {
        instance.hide({ trigger: "global-disable", nativeEvent: null, source: "api" });
      }
      instance.disable();
    });
  }

  function restoreAll() {
    globalDisabled = false;
    instances.forEach(function (instance) {
      instance.restore();
    });
    if (globalOptions.autoAttachTriggers && typeof document !== "undefined") {
      attachTriggersIn(document);
    }
  }

  function getDefaults() {
    return {
      autoAttachTriggers: globalOptions.autoAttachTriggers,
      footerSelector: globalOptions.footerSelector,
      scrollSelector: globalOptions.scrollSelector,
      breakpoints: {
        smallMax: globalOptions.breakpoints.smallMax,
        mediumMax: globalOptions.breakpoints.mediumMax
      }
    };
  }

  function setDefaults(partial) {
    if (!partial || typeof partial !== "object") return;
    if ("autoAttachTriggers" in partial) globalOptions.autoAttachTriggers = !!partial.autoAttachTriggers;
    if ("footerSelector" in partial) globalOptions.footerSelector = partial.footerSelector;
    if ("scrollSelector" in partial) {
      globalOptions.scrollSelector = partial.scrollSelector == null ? "" : String(partial.scrollSelector);
      if (scrollListenTarget) {
        detachScrollListener();
        updateScrollState();
        attachScrollListener();
        onScroll();
      }
    }
    if (partial.breakpoints) applyBreakpoints(partial.breakpoints);
  }

  function shouldAutoInit() {
    if (typeof document === "undefined") return false;
    if (typeof window !== "undefined" && "LAUNCHPOP_AUTO_INIT" in window) {
      return parseBool(window.LAUNCHPOP_AUTO_INIT, true);
    }
    var script = document.currentScript;
    if (script && script.hasAttribute("data-launchpop-auto-init")) {
      return parseBool(script.getAttribute("data-launchpop-auto-init"), true);
    }
    return true;
  }

  if (shouldAutoInit()) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        init({});
      });
    } else {
      init({});
    }
  }

  return {
    init: init,
    register: register,
    disable: disableAll,
    restore: restoreAll,
    on: function (eventName, handler) {
      globalEvents.on(eventName, handler);
    },
    off: function (eventName, handler) {
      globalEvents.off(eventName, handler);
    },
    getDefaults: getDefaults,
    setDefaults: setDefaults,
    _instances: instances
  };
});
