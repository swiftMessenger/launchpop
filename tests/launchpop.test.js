var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");

var scriptPath = path.join(__dirname, "..", "code", "launchpop", "v1", "launchpop.js");

function memoryStorage() {
  var data = {};
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem: function (key, value) {
      data[key] = String(value);
    },
    data: data
  };
}

function ClassList(className) {
  this.names = [];
  String(className || "").split(/\s+/).forEach(function (name) {
    if (name) this.names.push(name);
  }, this);
}

ClassList.prototype.add = function (name) {
  if (this.names.indexOf(name) === -1) this.names.push(name);
};

ClassList.prototype.remove = function (name) {
  this.names = this.names.filter(function (item) { return item !== name; });
};

ClassList.prototype.contains = function (name) {
  return this.names.indexOf(name) !== -1;
};

function matches(el, selector) {
  return selector.split(",").some(function (part) {
    return matchesOne(el, part.trim());
  });
}

function matchesOne(el, selector) {
  if (!el || !el.tagName) return false;
  var rest = selector;
  var tagMatch = /^[a-z0-9]+/i.exec(selector);
  if (tagMatch && selector.charAt(0) !== "." && selector.charAt(0) !== "[") {
    if (el.tagName !== tagMatch[0].toLowerCase()) return false;
    rest = selector.slice(tagMatch[0].length);
  }

  var notMatch = /:not\(\[([^\]]+)\]\)/.exec(rest);
  if (notMatch) {
    rest = rest.replace(/:not\(\[[^\]]+\]\)/, "");
    var token = notMatch[1];
    var splitAt = token.indexOf("=");
    if (splitAt === -1) {
      if (el.hasAttribute(token)) return false;
    } else if (el.getAttribute(token.slice(0, splitAt)) === stripQuotes(token.slice(splitAt + 1))) {
      return false;
    }
  }

  if (rest === "") return true;
  if (rest.charAt(0) === ".") return el.classList.contains(rest.slice(1));
  if (rest.charAt(0) === "[" && rest.charAt(rest.length - 1) === "]") {
    var body = rest.slice(1, -1);
    var eq = body.indexOf("=");
    if (eq === -1) return el.hasAttribute(body);
    return el.getAttribute(body.slice(0, eq)) === stripQuotes(body.slice(eq + 1));
  }
  return false;
}

function stripQuotes(value) {
  return value.replace(/^['"]|['"]$/g, "");
}

function descendants(root) {
  var found = [];
  function walk(node) {
    (node.children || []).forEach(function (child) {
      found.push(child);
      walk(child);
    });
  }
  walk(root);
  return found;
}

function listen(target) {
  var listeners = {};
  target.addEventListener = function (type, fn) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(fn);
  };
  target.removeEventListener = function (type, fn) {
    listeners[type] = (listeners[type] || []).filter(function (item) { return item !== fn; });
  };
  target.listenerCount = function (type) {
    return (listeners[type] || []).length;
  };
  return listeners;
}

function dispatch(listeners, type, event, start) {
  event.type = type;
  event.target = event.target || start;
  if (!event.preventDefault) {
    event.preventDefault = function () { event.defaultPrevented = true; };
  }
  var node = start;
  while (node) {
    (listeners(node)[type] || []).slice().forEach(function (fn) { fn(event); });
    if (event.cancelBubble) break;
    node = node.parentElement || null;
  }
  return event;
}

function createEnv(settings) {
  settings = settings || {};
  var html = element("html");
  var body = element("body");
  html.append(body);
  html.scrollHeight = 5000;
  html.offsetHeight = 5000;
  html.clientWidth = 1200;
  html.clientHeight = 800;
  body.scrollHeight = 0;
  body.offsetHeight = 0;
  body.clientWidth = 1200;
  body.clientHeight = 800;

  var documentListeners = listen({});
  var cookieJar = {};
  var document = {
    documentElement: html,
    body: body,
    readyState: settings.readyState || "complete",
    currentScript: null,
    activeElement: body,
    nodeType: 9,
    addEventListener: documentListeners.addEventListener,
    removeEventListener: documentListeners.removeEventListener,
    querySelector: function (selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll: function (selector) {
      return descendants(html).filter(function (node) { return matches(node, selector); });
    }
  };
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: function () {
      return Object.keys(cookieJar).map(function (name) {
        return name + "=" + cookieJar[name];
      }).join("; ");
    },
    set: function (value) {
      document._cookieWrites.push(String(value));
      var pair = String(value).split(";")[0];
      var eq = pair.indexOf("=");
      if (eq === -1) return;
      cookieJar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  });
  document._cookieWrites = [];
  document._cookieJar = cookieJar;
  documentListeners = listen(document);
  document.dispatch = function (type, event) {
    event = event || {};
    event.type = type;
    event.target = event.target || document;
    if (!event.preventDefault) event.preventDefault = function () { event.defaultPrevented = true; };
    (document._bucket[type] || []).slice().forEach(function (fn) { fn(event); });
    return event;
  };
  document._bucket = documentListeners;

  var windowListeners = listen({});
  var window = {
    innerWidth: settings.width || 1200,
    innerHeight: settings.height || 800,
    pageYOffset: 0,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    addEventListener: windowListeners.addEventListener,
    removeEventListener: windowListeners.removeEventListener,
    dispatch: function (type, event) {
      event = event || {};
      event.type = type;
      event.target = window;
      if (!event.preventDefault) event.preventDefault = function () { event.defaultPrevented = true; };
      (window._bucket[type] || []).slice().forEach(function (fn) { fn(event); });
      return event;
    }
  };
  windowListeners = listen(window);
  window._bucket = windowListeners;
  if (!settings.auto) window.LAUNCHPOP_AUTO_INIT = false;

  return { window: window, document: document, body: body, html: html };
}

function element(tag, attrs) {
  var node = {
    nodeType: 1,
    tagName: tag.toLowerCase(),
    children: [],
    parentElement: null,
    attrs: {}
  };
  Object.keys(attrs || {}).forEach(function (key) {
    node.attrs[key] = String(attrs[key]);
  });
  node.classList = new ClassList(node.attrs["class"]);
  node.getAttribute = function (name) {
    return Object.prototype.hasOwnProperty.call(node.attrs, name) ? node.attrs[name] : null;
  };
  node.setAttribute = function (name, value) {
    node.attrs[name] = String(value);
  };
  node.hasAttribute = function (name) {
    return Object.prototype.hasOwnProperty.call(node.attrs, name);
  };
  node.removeAttribute = function (name) {
    delete node.attrs[name];
  };
  node.append = function (child) {
    child.parentElement = node;
    node.children.push(child);
    return child;
  };
  node.matches = function (selector) { return matches(node, selector); };
  node.closest = function (selector) {
    var current = node;
    while (current && current.matches) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  };
  node.contains = function (other) {
    var current = other;
    while (current) {
      if (current === node) return true;
      current = current.parentElement;
    }
    return false;
  };
  node.querySelectorAll = function (selector) {
    return descendants(node).filter(function (child) { return matches(child, selector); });
  };
  node.focus = function () {
    if (global.document) global.document.activeElement = node;
  };
  node.getBoundingClientRect = function () { return { top: 0 }; };
  node._bucket = listen(node);
  node.dispatch = function (type, event) {
    return dispatch(function (current) {
      return (current && current._bucket) || {};
    }, type, event || {}, node);
  };
  return node;
}

function dialog(attrs, children) {
  var node = element("div", Object.assign({ role: "dialog", "aria-modal": "true", "aria-hidden": "true" }, attrs || {}));
  (children || [element("button", { type: "button", "data-launchpop-close": "true", "aria-label": "Close" })]).forEach(function (child) {
    node.append(child);
  });
  return node;
}

function opened(node) {
  return node.getAttribute("aria-hidden") === "false";
}

function sessionRecord(env) {
  var raw = env.window.localStorage.getItem("launchpop");
  if (!raw) return null;
  return JSON.parse(raw);
}

function seedSession(env, record) {
  env.window.localStorage.setItem("launchpop", JSON.stringify({
    session: record.session || "",
    last: record.last || {},
    count: record.count || {},
    seen: record.seen == null ? Date.now() : record.seen
  }));
  if (record.joined !== false) env.window.sessionStorage.setItem("launchpop", "1");
}

function loadLibrary() {
  delete require.cache[require.resolve(scriptPath)];
  return require(scriptPath);
}

function scenario(name, fn, options) {
  test(name, options || {}, function () {
    var env = createEnv(options && options.env);
    if (options && options.prepare) options.prepare(env);
    global.window = env.window;
    global.document = env.document;
    var lib = loadLibrary();
    function cleanup() {
      lib._instances.slice().forEach(function (instance) { instance.destroy(); });
    }
    var result;
    try {
      result = fn(env, lib);
    } catch (err) {
      cleanup();
      throw err;
    }
    if (result && typeof result.then === "function") {
      return result.then(function (value) {
        cleanup();
        return value;
      }, function (err) {
        cleanup();
        throw err;
      });
    }
    cleanup();
  });
}

function mount(env, node) {
  env.body.append(node);
  return node;
}

function shows(lib) {
  var events = [];
  lib.on("show", function (payload) { events.push(payload); });
  return events;
}

scenario("opens on load when no trigger is configured", function (env, lib) {
  var events = shows(lib);
  var box = mount(env, dialog({ "data-launchpop-id": "welcome" }));
  lib.init();
  assert.equal(opened(box), true);
  assert.equal(events[0].trigger, "immediate");
  assert.equal(box.classList.contains("launchpop-visible"), true);
});

scenario("treats zero and blank trigger values as unset", function (env, lib) {
  var box = mount(env, dialog({
    "data-launchpop-id": "zero",
    "data-launchpop-delay-seconds": "0",
    "data-launchpop-scroll-percent": "0"
  }));
  lib.init();
  assert.equal(opened(box), true);
});

scenario("any mode opens on the first trigger", function (env, lib) {
  var box = mount(env, dialog({
    "data-launchpop-id": "any",
    "data-launchpop-trigger-mode": "any",
    "data-launchpop-exit-intent": "true",
    "data-launchpop-scroll-percent": "80"
  }));
  lib.init();
  assert.equal(opened(box), false);
  env.document.dispatch("mouseout", { clientY: -1, relatedTarget: null });
  assert.equal(opened(box), true);
});

scenario("all mode waits for every configured trigger", function (env, lib) {
  var box = mount(env, dialog({
    "data-launchpop-id": "all",
    "data-launchpop-trigger-mode": "all",
    "data-launchpop-exit-intent": "true",
    "data-launchpop-scroll-percent": "50"
  }));
  lib.init();
  env.document.dispatch("mouseout", { clientY: -1, relatedTarget: null });
  assert.equal(opened(box), false);
  env.window.pageYOffset = 2500;
  env.window.dispatch("scroll");
  assert.equal(opened(box), true);
});

scenario("ignores an exit event that is not leaving through the top", function (env, lib) {
  var box = mount(env, dialog({ "data-launchpop-id": "exit", "data-launchpop-exit-intent": "true" }));
  lib.init();
  env.document.dispatch("mouseout", { clientY: 20, relatedTarget: null });
  env.document.dispatch("mouseout", { clientY: -1, relatedTarget: env.body });
  assert.equal(opened(box), false);
  env.document.dispatch("mouseout", { clientY: 0, relatedTarget: null });
  assert.equal(opened(box), true);
});

scenario("scrollSelector measures the chosen element instead of the document", function (env, lib) {
  var scroller = element("div", { "class": "main-scroll" });
  scroller.scrollTop = 0;
  scroller.clientHeight = 400;
  scroller.scrollHeight = 2000;
  mount(env, scroller);
  lib.setDefaults({ scrollSelector: ".main-scroll" });
  var box = mount(env, dialog({
    "data-launchpop-id": "inner",
    "data-launchpop-scroll-percent": "50"
  }));
  lib.init();
  assert.equal(opened(box), false);
  env.window.pageYOffset = 5000;
  env.window.dispatch("scroll");
  assert.equal(opened(box), false);
  scroller.scrollTop = 800;
  scroller.dispatch("scroll");
  assert.equal(opened(box), true);
  assert.equal(lib.getDefaults().scrollSelector, ".main-scroll");
});

scenario("a missing scrollSelector keeps measuring the document", function (env, lib) {
  env.html.scrollHeight = 5000;
  env.html.offsetHeight = 5000;
  env.window.innerHeight = 800;
  lib.setDefaults({ scrollSelector: ".missing" });
  var box = mount(env, dialog({
    "data-launchpop-id": "document-scroll",
    "data-launchpop-scroll-percent": "50"
  }));
  lib.init();
  assert.equal(opened(box), false);
  env.window.pageYOffset = 2100;
  env.window.dispatch("scroll");
  assert.equal(opened(box), true);
});

scenario("a blank scrollSelector keeps measuring the document", function (env, lib) {
  env.html.scrollHeight = 5000;
  env.html.offsetHeight = 5000;
  env.window.innerHeight = 800;
  lib.setDefaults({ scrollSelector: "  " });
  var box = mount(env, dialog({
    "data-launchpop-id": "blank-scroll",
    "data-launchpop-scroll-percent": "50"
  }));
  lib.init();
  env.window.pageYOffset = 2100;
  env.window.dispatch("scroll");
  assert.equal(opened(box), true);
});

scenario("footer distance uses the scroll element's origin", function (env, lib) {
  var scroller = element("div", { "class": "main-scroll" });
  scroller.scrollTop = 0;
  scroller.clientHeight = 1000;
  scroller.scrollHeight = 4000;
  scroller.getBoundingClientRect = function () { return { top: 100 }; };
  mount(env, scroller);
  var footer = element("div", { "class": "site-footer" });
  footer.getBoundingClientRect = function () {
    return { top: 100 + 1800 - scroller.scrollTop };
  };
  mount(env, footer);
  lib.setDefaults({ scrollSelector: ".main-scroll" });
  var box = mount(env, dialog({
    "data-launchpop-id": "inner-footer",
    "data-launchpop-scroll-percent": "50",
    "data-launchpop-scroll-relative-to-footer": "true",
    "data-launchpop-footer-selector": ".site-footer"
  }));
  lib.init();
  assert.equal(opened(box), false);
  scroller.scrollTop = 400;
  scroller.dispatch("scroll");
  assert.equal(opened(box), true);
});

scenario("opens a scroll trigger that is already satisfied on a short page", function (env, lib) {
  env.html.scrollHeight = 800;
  env.html.offsetHeight = 800;
  env.window.innerHeight = 800;
  var box = mount(env, dialog({ "data-launchpop-id": "short", "data-launchpop-scroll-percent": "30" }));
  lib.init();
  assert.equal(opened(box), true);
});

scenario("measures scroll percent to the selected footer", function (env, lib) {
  env.html.scrollHeight = 4000;
  env.html.offsetHeight = 4000;
  env.window.innerHeight = 1000;
  var footer = element("div", { "class": "site-footer" });
  footer.getBoundingClientRect = function () {
    return { top: 1800 - env.window.pageYOffset };
  };
  mount(env, footer);
  var box = mount(env, dialog({
    "data-launchpop-id": "footer",
    "data-launchpop-scroll-percent": "50",
    "data-launchpop-scroll-relative-to-footer": "true",
    "data-launchpop-footer-selector": ".site-footer"
  }));
  lib.init();
  assert.equal(opened(box), false);
  env.window.pageYOffset = 400;
  env.window.dispatch("scroll");
  assert.equal(opened(box), true);
});

scenario("falls back to the footer element when a selector matches nothing", function (env, lib) {
  env.html.scrollHeight = 4000;
  env.html.offsetHeight = 4000;
  env.window.innerHeight = 1000;
  var footer = element("footer");
  footer.getBoundingClientRect = function () {
    return { top: 1800 - env.window.pageYOffset };
  };
  mount(env, footer);
  var box = mount(env, dialog({
    "data-launchpop-id": "fallback-footer",
    "data-launchpop-scroll-percent": "50",
    "data-launchpop-scroll-relative-to-footer": "true",
    "data-launchpop-footer-selector": "???"
  }));
  lib.init();
  env.window.pageYOffset = 400;
  env.window.dispatch("scroll");
  assert.equal(opened(box), true);
});

scenario("a click opens immediately and does not wait for auto triggers", function (env, lib) {
  var events = shows(lib);
  var button = element("button", { "class": "open-promo" });
  mount(env, button);
  var box = mount(env, dialog({
    "data-launchpop-id": "click",
    "data-launchpop-delay-seconds": "30",
    "data-launchpop-click-selector": ".open-promo"
  }));
  lib.init();
  assert.equal(opened(box), false);
  button.dispatch("click");
  assert.equal(opened(box), true);
  assert.equal(events.length, 1);
  assert.equal(events[0].trigger, "click");
});

scenario("a click still respects breakpoint and view-count limits", function (env, lib) {
  env.window.innerWidth = 400;
  var button = element("a", { href: "/promo", "class": "open-promo" });
  mount(env, button);
  var box = mount(env, dialog({
    "data-launchpop-id": "limited-click",
    "data-launchpop-click-selector": ".open-promo",
    "data-launchpop-hide-small": "true",
    "data-launchpop-max-limit": "1"
  }));
  lib.init();
  var blocked = button.dispatch("click");
  assert.ok(!blocked.defaultPrevented);
  assert.equal(opened(box), false);

  env.window.innerWidth = 1200;
  var allowed = button.dispatch("click");
  assert.equal(allowed.defaultPrevented, true);
  assert.equal(opened(box), true);
  assert.equal(sessionRecord(env).count["limited-click"], 1);

  box.dispatch("click", { target: box.querySelectorAll("button")[0] });
  assert.equal(opened(box), false);
  var again = button.dispatch("click");
  assert.equal(again.defaultPrevented, true);
  assert.equal(opened(box), true);
  assert.equal(sessionRecord(env).count["limited-click"], 2);
});

scenario("a click can open again after close when no view limit is set", function (env, lib) {
  var button = element("button", { "class": "open-promo" });
  mount(env, button);
  var box = mount(env, dialog({
    "data-launchpop-id": "reclick",
    "data-launchpop-click-selector": ".open-promo",
    "data-launchpop-max-limit": "5"
  }));
  lib.init();
  button.dispatch("click");
  button.dispatch("click");
  assert.equal(sessionRecord(env).count.reclick, 1);
  box.dispatch("click", { target: box.querySelectorAll("[data-launchpop-close]")[0] });
  button.dispatch("click");
  assert.equal(opened(box), true);
  assert.equal(sessionRecord(env).count.reclick, 2);
});

scenario("auto triggers do not reopen a dialog after it closes", function (env, lib) {
  var box = mount(env, dialog({ "data-launchpop-id": "once", "data-launchpop-scroll-percent": "10" }));
  lib.init();
  env.window.pageYOffset = 1000;
  env.window.dispatch("scroll");
  assert.equal(opened(box), true);
  box.dispatch("click", { target: box });
  assert.equal(opened(box), false);
  env.window.pageYOffset = 2000;
  env.window.dispatch("scroll");
  assert.equal(opened(box), false);
});

scenario("minutes and shown limits are kept for this visit and shared by id", function (env, lib) {
  seedSession(env, { last: { recent: Date.now() }, count: {} });
  var blocked = mount(env, dialog({ "data-launchpop-id": "recent", "data-launchpop-minutes-limit": "10" }));
  var allowed = mount(env, dialog({
    "data-launchpop-id": "older",
    "data-launchpop-minutes-limit": "1",
    "data-launchpop-max-limit": "2"
  }));
  seedSession(env, { last: { recent: Date.now(), older: Date.now() - 60001 }, count: {} });
  lib.init();
  assert.equal(opened(blocked), false);
  assert.equal(opened(allowed), true);
  assert.equal(sessionRecord(env).count.older, 1);
  assert.ok(sessionRecord(env).last.older);
});

scenario("a later visit does not keep the previous show history", function (env, lib) {
  seedSession(env, {
    last: { recent: Date.now() },
    count: { recent: 2 },
    seen: Date.now() - (61 * 60 * 1000),
    joined: false
  });
  var box = mount(env, dialog({
    "data-launchpop-id": "recent",
    "data-launchpop-minutes-limit": "10",
    "data-launchpop-max-limit": "1"
  }));
  lib.init();
  assert.equal(opened(box), true);
});

scenario("a new tab keeps history while another tab's visit is still fresh", function (env, lib) {
  seedSession(env, {
    last: { recent: Date.now() },
    count: {},
    seen: Date.now(),
    joined: false
  });
  var box = mount(env, dialog({
    "data-launchpop-id": "recent",
    "data-launchpop-minutes-limit": "10"
  }));
  lib.init();
  assert.equal(opened(box), false);
});

scenario("a cms session id keeps history past the one hour fallback", function (env, lib) {
  seedSession(env, {
    session: "visit-a",
    last: { recent: Date.now() },
    count: {},
    seen: Date.now() - (2 * 60 * 60 * 1000),
    joined: false
  });
  var box = mount(env, dialog({
    "data-launchpop-id": "recent",
    "data-launchpop-minutes-limit": "10",
    "data-launchpop-session": "visit-a"
  }));
  lib.init();
  assert.equal(opened(box), false);
});

scenario("a new cms session id starts show history over", function (env, lib) {
  seedSession(env, {
    session: "visit-a",
    last: { recent: Date.now() },
    count: { recent: 1 },
    seen: Date.now(),
    joined: false
  });
  var box = mount(env, dialog({
    "data-launchpop-id": "recent",
    "data-launchpop-minutes-limit": "10",
    "data-launchpop-max-limit": "1",
    "data-launchpop-session": "visit-b"
  }));
  lib.init();
  assert.equal(opened(box), true);
  assert.equal(sessionRecord(env).session, "visit-b");
});

scenario("dialogs that share an id share one shown count", function (env, lib) {
  var first = mount(env, dialog({ "data-launchpop-id": "shared", "data-launchpop-max-limit": "1" }));
  var second = mount(env, dialog({ "data-launchpop-id": "shared", "data-launchpop-max-limit": "1" }));
  lib.init();
  assert.equal(opened(first), true);
  assert.equal(opened(second), false);
});

scenario("an empty id uses the shared default key", function (env, lib) {
  mount(env, dialog({ "data-launchpop-id": "", "data-launchpop-minutes-limit": "5" }));
  lib.init();
  assert.ok(sessionRecord(env).last.launchpop_default);
});

scenario("zero limits are ignored", function (env, lib) {
  var box = mount(env, dialog({
    "data-launchpop-id": "zero-limits",
    "data-launchpop-minutes-limit": "0",
    "data-launchpop-max-limit": "0"
  }));
  lib.init();
  assert.equal(opened(box), true);
  assert.equal(sessionRecord(env), null);
});

scenario("a blocked store does not stop the dialog from opening", function (env, lib) {
  env.window.localStorage.getItem = function () { throw new Error("blocked"); };
  env.window.localStorage.setItem = function () { throw new Error("blocked"); };
  var box = mount(env, dialog({
    "data-launchpop-id": "storage",
    "data-launchpop-minutes-limit": "10",
    "data-launchpop-max-limit": "2"
  }));
  lib.init();
  assert.equal(opened(box), true);
});

scenario("screen-size limits use the documented boundaries and recover on resize", function (env, lib) {
  env.window.innerWidth = 767;
  var small = mount(env, dialog({ "data-launchpop-id": "small", "data-launchpop-hide-small": "true" }));
  lib.init();
  assert.equal(opened(small), false);
  env.window.innerWidth = 768;
  env.window.dispatch("resize");
  assert.equal(opened(small), true);
});

scenario("medium and large exclusions follow 1199 and 1200", function (env, lib) {
  env.window.innerWidth = 1199;
  var medium = mount(env, dialog({ "data-launchpop-id": "medium", "data-launchpop-hide-medium": "true" }));
  env.window.innerWidth = 1200;
  var large = mount(env, dialog({ "data-launchpop-id": "large", "data-launchpop-hide-large": "true" }));
  env.window.innerWidth = 1199;
  lib.init();
  assert.equal(opened(medium), false);
  assert.equal(opened(large), true);
  lib._instances.slice().forEach(function (instance) { instance.destroy(); });
  env.window.innerWidth = 1200;
  medium.setAttribute("aria-hidden", "true");
  large.setAttribute("aria-hidden", "true");
  lib.setDefaults({ maxPerPage: 0 });
  lib.init();
  assert.equal(opened(medium), true);
  assert.equal(opened(large), false);
});

scenario("only one dialog is visible", function (env, lib) {
  lib.setDefaults({ maxPerPage: 0 });
  var reasons = [];
  lib.on("hide", function (payload) { reasons.push(payload.trigger); });
  var first = mount(env, dialog({ "data-launchpop-id": "one" }));
  var second = mount(env, dialog({ "data-launchpop-id": "two" }));
  lib.init();
  assert.equal(opened(first), false);
  assert.equal(opened(second), true);
  assert.deepEqual(reasons, ["superseded"]);
});

scenario("only one popup opens automatically on a page", function (env, lib) {
  var first = mount(env, dialog({ "data-launchpop-id": "first" }));
  var second = mount(env, dialog({ "data-launchpop-id": "second" }));
  lib.init();
  assert.equal(opened(first), true);
  assert.equal(opened(second), false);
  assert.equal(lib.getDefaults().maxPerPage, 1);
});

scenario("raising maxPerPage allows that many automatic opens", function (env, lib) {
  lib.setDefaults({ maxPerPage: 2 });
  mount(env, dialog({ "data-launchpop-id": "first" }));
  var second = mount(env, dialog({ "data-launchpop-id": "second" }));
  lib.init();
  assert.equal(lib._instances[0].hasOpened, true);
  assert.equal(lib._instances[1].hasOpened, true);
  assert.equal(opened(second), true);
});

scenario("a zero maxPerPage removes the automatic page limit", function (env, lib) {
  lib.setDefaults({ maxPerPage: 0 });
  mount(env, dialog({ "data-launchpop-id": "first" }));
  mount(env, dialog({ "data-launchpop-id": "second" }));
  lib.init();
  assert.equal(lib._instances[0].hasOpened, true);
  assert.equal(lib._instances[1].hasOpened, true);
});

scenario("a later automatic trigger stays closed after the page limit is met", function (env, lib) {
  env.html.scrollHeight = 5000;
  env.html.offsetHeight = 5000;
  env.window.innerHeight = 800;
  var first = mount(env, dialog({ "data-launchpop-id": "first" }));
  var second = mount(env, dialog({
    "data-launchpop-id": "second",
    "data-launchpop-scroll-percent": "50"
  }));
  lib.init();
  lib._instances[0].hide();
  assert.equal(opened(first), false);
  env.window.pageYOffset = 2100;
  env.window.dispatch("scroll");
  assert.equal(opened(second), false);
});

scenario("a click can open another popup after the page limit is met", function (env, lib) {
  mount(env, dialog({ "data-launchpop-id": "first" }));
  var button = element("button", { "class": "open-second" });
  mount(env, button);
  var second = mount(env, dialog({
    "data-launchpop-id": "second",
    "data-launchpop-click-selector": ".open-second",
    "data-launchpop-delay-seconds": "30"
  }));
  lib.init();
  assert.equal(opened(second), false);
  button.dispatch("click");
  assert.equal(opened(second), true);
});

scenario("the close button, overlay, and Escape key close the dialog", function (env, lib) {
  var reasons = [];
  lib.on("hide", function (payload) { reasons.push(payload.trigger); });
  var outside = element("button", { id: "outside" });
  mount(env, outside);
  outside.focus();
  var box = mount(env, dialog({ "data-launchpop-id": "close" }));
  var inside = element("p");
  box.append(inside);
  lib.init();
  assert.equal(global.document.activeElement, box.querySelectorAll("button")[0]);

  inside.dispatch("click");
  assert.equal(opened(box), true);
  box.dispatch("click", { target: box });
  assert.equal(opened(box), false);
  assert.equal(global.document.activeElement, outside);

  lib._instances[0].show();
  box.querySelectorAll("[data-launchpop-close]")[0].dispatch("click");
  assert.equal(opened(box), false);

  lib._instances[0].show();
  env.document.dispatch("keydown", { key: "Escape" });
  assert.equal(opened(box), false);
  assert.deepEqual(reasons, ["overlay", "close-button", "esc"]);
});

scenario("Tab stays inside the dialog", function (env, lib) {
  var first = element("button", { id: "first" });
  var disabled = element("button", { id: "disabled", disabled: "disabled" });
  var last = element("button", { id: "last" });
  mount(env, dialog({ "data-launchpop-id": "trap" }, [disabled, first, last]));
  lib.init();
  assert.equal(global.document.activeElement, first);

  var forward = env.document.dispatch("keydown", { key: "Tab", shiftKey: false });
  assert.equal(forward.defaultPrevented, undefined);
  last.focus();
  forward = env.document.dispatch("keydown", { key: "Tab", shiftKey: false });
  assert.equal(forward.defaultPrevented, true);
  assert.equal(global.document.activeElement, first);

  var backward = env.document.dispatch("keydown", { key: "Tab", shiftKey: true });
  assert.equal(backward.defaultPrevented, true);
  assert.equal(global.document.activeElement, last);
});

scenario("focuses the dialog when it has nothing focusable", function (env, lib) {
  var box = mount(env, dialog({ "data-launchpop-id": "empty" }, [element("div")]));
  lib.init();
  assert.equal(global.document.activeElement, box);
  assert.equal(box.getAttribute("tabindex"), "-1");
});

scenario("binds data-launchpop-triggers when auto attach is on", function (env, lib) {
  var opener = element("button", { "data-launchpop-triggers": "promo" });
  mount(env, opener);
  var box = mount(env, dialog({ "data-launchpop-id": "promo", "data-launchpop-delay-seconds": "30" }));
  lib.init({ autoAttachTriggers: true });
  opener.dispatch("click");
  assert.equal(opened(box), true);
});

scenario("init can be limited to one subtree", function (env, lib) {
  var inside = dialog({ "data-launchpop-id": "inside" });
  var outside = dialog({ "data-launchpop-id": "outside" });
  var root = element("section");
  root.append(inside);
  mount(env, root);
  mount(env, outside);
  lib.init({ root: root });
  assert.equal(opened(inside), true);
  assert.equal(opened(outside), false);
  assert.equal(lib._instances.length, 1);
});

scenario("an invalid click selector does not throw", function (env, lib) {
  var box = mount(env, dialog({
    "data-launchpop-id": "bad-selector",
    "data-launchpop-click-selector": "???"
  }));
  assert.doesNotThrow(function () { lib.init(); });
  assert.equal(opened(box), false);
});

scenario("a listener error does not stop the other listeners", function (env, lib) {
  var saw = 0;
  lib.on("show", function () { throw new Error("broken listener"); });
  lib.on("show", function () { saw += 1; });
  mount(env, dialog({ "data-launchpop-id": "events" }));
  lib.init();
  assert.equal(saw, 1);
  lib.off("show");
});

scenario("direct show bypasses frequency limits", function (env, lib) {
  seedSession(env, { last: { api: Date.now() }, count: {} });
  var box = mount(env, dialog({ "data-launchpop-id": "api", "data-launchpop-minutes-limit": "30" }));
  lib.init();
  assert.equal(opened(box), false);
  lib._instances[0].show();
  assert.equal(opened(box), true);
});

scenario("register requires an element and accepts a config object", function (env, lib) {
  assert.equal(lib.register({}), null);
  var box = dialog();
  mount(env, box);
  var instance = lib.register({
    id: "api-config",
    element: box,
    triggerMode: "all",
    triggers: { delay_seconds: 0, scroll_percent: 150, exit_intent: "false" }
  });
  assert.equal(opened(box), false);
  assert.equal(instance.triggerMode, "all");
  env.window.pageYOffset = 5000;
  env.window.dispatch("scroll");
  assert.equal(opened(box), true);
});

scenario("disable closes an open dialog and restore can arm it again", function (env, lib) {
  var box = mount(env, dialog({ "data-launchpop-id": "pause", "data-launchpop-scroll-percent": "20" }));
  lib.init();
  lib.disable();
  assert.equal(opened(box), false);
  env.window.pageYOffset = 2000;
  env.window.dispatch("scroll");
  assert.equal(opened(box), false);
  lib.restore();
  env.window.dispatch("scroll");
  assert.equal(opened(box), true);
});

scenario("destroy removes the dialog from the public instance list", function (env, lib) {
  mount(env, dialog({ "data-launchpop-id": "gone" }));
  lib.init();
  lib._instances[0].destroy();
  assert.equal(lib._instances.length, 0);
  assert.doesNotThrow(function () { env.window.dispatch("scroll"); });
});

scenario("setDefaults changes later dialogs and getDefaults returns a copy", function (env, lib) {
  lib.setDefaults({
    autoAttachTriggers: true,
    footerSelector: ".site-footer",
    breakpoints: { smallMax: 500, mediumMax: 900 }
  });
  var copy = lib.getDefaults();
  copy.breakpoints.smallMax = 1;
  assert.equal(lib.getDefaults().breakpoints.smallMax, 500);
  assert.equal(lib.getDefaults().footerSelector, ".site-footer");

  env.window.innerWidth = 600;
  var box = mount(env, dialog({ "data-launchpop-id": "sized", "data-launchpop-hide-medium": "true" }));
  lib.init();
  assert.equal(opened(box), false);
});

scenario("auto-inits from the DOM when the document is already loaded", function (env) {
  assert.equal(opened(env.body.children[0]), true);
}, {
  env: { auto: true },
  prepare: function (env) {
    mount(env, dialog({ "data-launchpop-id": "auto" }));
  }
});

scenario("waits for DOMContentLoaded when the document is still loading", function (env, lib) {
  assert.equal(opened(env.body.children[0]), false);
  env.document.dispatch("DOMContentLoaded");
  assert.equal(opened(env.body.children[0]), true);
  assert.equal(lib._instances.length, 1);
}, {
  env: { auto: true, readyState: "loading" },
  prepare: function (env) {
    mount(env, dialog({ "data-launchpop-id": "waiting" }));
  }
});

scenario("data-launchpop-auto-init false leaves startup to the caller", function (env, lib) {
  assert.equal(opened(env.body.children[0]), false);
  lib.init();
  assert.equal(opened(env.body.children[0]), true);
}, {
  env: { auto: true },
  prepare: function (env) {
    env.document.currentScript = element("script", { "data-launchpop-auto-init": "false" });
    mount(env, dialog({ "data-launchpop-id": "manual" }));
  }
});

scenario("a delay trigger opens after its seconds elapse", function (env, lib) {
  var box = mount(env, dialog({
    "data-launchpop-id": "delay",
    "data-launchpop-trigger-mode": "all",
    "data-launchpop-delay-seconds": "1",
    "data-launchpop-exit-intent": "true"
  }));
  lib.init();
  env.document.dispatch("mouseout", { clientY: -1, relatedTarget: null });
  assert.equal(opened(box), false);
  return new Promise(function (resolve) {
    setTimeout(function () {
      assert.equal(opened(box), true);
      resolve();
    }, 1200);
  });
}, { timeout: 5000 });

scenario("idle time opens the dialog and activity resets it", function (env, lib) {
  var box = mount(env, dialog({ "data-launchpop-id": "idle", "data-launchpop-inactivity-seconds": "1" }));
  lib.init();
  return new Promise(function (resolve) {
    setTimeout(function () {
      env.window.dispatch("mousemove");
      setTimeout(function () {
        assert.equal(opened(box), false);
        setTimeout(function () {
          assert.equal(opened(box), true);
          resolve();
        }, 1200);
      }, 600);
    }, 600);
  });
}, { timeout: 5000 });

scenario("init without a document warns and returns", function () {
  var warnings = [];
  var original = console.warn;
  console.warn = function (message) { warnings.push(message); };
  global.window = undefined;
  global.document = undefined;
  var lib = loadLibrary();
  try {
    lib.init();
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = original;
  }
});
