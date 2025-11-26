function loadLaunchpop() {
  jest.resetModules();
  // Disable auto-init so tests control when parsing happens.
  global.LAUNCHPOP_AUTO_INIT = false;
  return require("../launchpop");
}

describe("launchpop", () => {
  beforeEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = "";
    localStorage.clear();
    sessionStorage.clear();
    // Default to a large viewport unless a test overrides.
    global.innerWidth = 1300;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("parses DOM attributes and clamps values", () => {
    document.body.innerHTML = `
      <div
        id="dom"
        data-launchpop-id="dom"
        data-launchpop-scroll-percent="200"
        data-launchpop-scroll-pixels="-5"
        data-launchpop-delay-seconds="999"
        data-launchpop-exit-intent="TRUE"
        data-launchpop-minutes-limit="15"
        data-launchpop-max-limit="2"
        data-launchpop-hide-small="true"
        data-launchpop-hide-medium="false"
        data-launchpop-hide-large="false"
        data-launchpop-inactivity-seconds="5000"
      ></div>
    `;

    const launchpop = loadLaunchpop();
    launchpop.init({ root: document });

    const instance = launchpop._instances[0];

    expect(instance.triggersConfig.scroll_percent).toBe(100);
    expect(instance.triggersConfig.scroll_pixels).toBe(0);
    expect(instance.triggersConfig.delay_seconds).toBe(120);
    expect(instance.triggersConfig.exit_intent).toBe(true);
    expect(instance.triggersConfig.inactivity_seconds).toBe(1800);
    expect(instance.limits.minutes).toBe(15);
    expect(instance.limits.max).toBe(2);
    expect(instance.limits.breakpoints).toEqual({
      small: false,
      medium: true,
      large: true
    });

    const element = instance.element;
    expect(element.getAttribute("aria-hidden")).toBe("true");
    expect(element.getAttribute("role")).toBe("dialog");
    expect(element.getAttribute("aria-modal")).toBe("true");
  });

  test("shows immediately when no triggers are configured", () => {
    const element = document.createElement("div");
    const button = document.createElement("button");
    element.appendChild(button);
    document.body.appendChild(element);

    const launchpop = loadLaunchpop();
    const instance = launchpop.register({ id: "immediate", element });

    expect(instance.shown).toBe(true);
    expect(element.getAttribute("data-launchpop-visible")).toBe("true");
    expect(element.getAttribute("aria-hidden")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  test("blocks showing when frequency limits are exceeded", () => {
    const id = "limited";
    localStorage.setItem(`launchpop_lastShown_${id}`, String(Date.now()));
    sessionStorage.setItem(`launchpop_sessionCount_${id}`, "3");

    const element = document.createElement("div");
    document.body.appendChild(element);

    const launchpop = loadLaunchpop();
    const instance = launchpop.register({
      id,
      element,
      limits: { minutes: 10, max: 3 }
    });

    expect(instance.shown).toBe(false);
    expect(instance.blockedByFrequencyCap).toBe(true);
    expect(element.hasAttribute("data-launchpop-visible")).toBe(false);
  });

  test("respects breakpoint gating to prevent showing", () => {
    global.innerWidth = 600; // small viewport
    const element = document.createElement("div");
    document.body.appendChild(element);

    const launchpop = loadLaunchpop();
    const instance = launchpop.register({
      id: "bp",
      element,
      limits: { breakpoints: { small: false, medium: true, large: true } }
    });

    expect(instance.shown).toBe(false);
    expect(instance.blockedByFrequencyCap).toBe(true);
    expect(element.hasAttribute("data-launchpop-visible")).toBe(false);
  });

  test("waits for delay trigger before showing", () => {
    jest.useFakeTimers();

    const element = document.createElement("div");
    document.body.appendChild(element);

    const launchpop = loadLaunchpop();
    const instance = launchpop.register({
      id: "delay",
      element,
      triggers: { delay_seconds: 2 }
    });

    expect(instance.shown).toBe(false);

    jest.advanceTimersByTime(1500);
    expect(instance.shown).toBe(false);

    jest.advanceTimersByTime(600);
    expect(instance.shown).toBe(true);
    expect(element.getAttribute("data-launchpop-visible")).toBe("true");
  });

  test("inactivity trigger fires after idle duration", () => {
    jest.useFakeTimers();

    const element = document.createElement("div");
    document.body.appendChild(element);

    const launchpop = loadLaunchpop();
    const instance = launchpop.register({
      id: "idle",
      element,
      triggers: { inactivity_seconds: 1 }
    });

    // Activity resets timer
    window.dispatchEvent(new Event("mousemove"));
    jest.advanceTimersByTime(900);
    expect(instance.shown).toBe(false);

    jest.advanceTimersByTime(200);
    expect(instance.shown).toBe(true);
    expect(instance._lastTriggerContext.trigger).toBe("inactivity");
  });
});
