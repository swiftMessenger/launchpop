# launchpop

LaunchPop is a lightweight, framework-agnostic JavaScript library for showing accessible popups (modals) based on flexible triggers.

## Quick start

Include the script and mark up a popup with `data-launchpop-id`:

```html
<div id="newsletter" data-launchpop-id="newsletter" aria-label="Newsletter signup">
  <button data-launchpop-close>&times;</button>
  ...
</div>

<button data-launchpop-triggers="newsletter">Open newsletter</button>

<script src="/path/to/launchpop.js"></script>
```

By default the library auto-initializes on `DOMContentLoaded` and connects any elements that declare matching `data-launchpop-triggers` attributes. To opt out of auto-init (for example, when hydrating after a SPA render or for optimizing browser performance), set a flag before loading the script or add an attribute to the script tag:

```html
<script>window.LAUNCHPOP_AUTO_INIT = false;</script>
<script src="/path/to/launchpop.js" data-launchpop-auto-init="false"></script>

<script>
  // Later, when ready
  launchpop.init();
</script>
```

## Registering popups in JavaScript

If you prefer JavaScript configuration instead of data attributes, call `launchpop.register`:

```js
const instance = launchpop.register({
  id: "newsletter",
  element: document.getElementById("newsletter"),
  triggers: {
    delay_seconds: 5
  }
});
```

`register` returns the instance so you can manage its lifecycle:

- `instance.show()` / `instance.hide()` — control visibility imperatively.
- `instance.disable()` / `instance.restore()` — temporarily pause or re-enable triggers.
- `instance.destroy()` — fully detach listeners and remove the instance from the registry.

## Trigger options

All triggers are optional and can be mixed:

- `scroll_percent`: number between `0`–`100` indicating the percent of page scroll before showing.
- `scroll_pixels`: number of pixels to scroll before showing.
- `scroll_relative_to_footer`: percent of the distance from the bottom of the viewport to the footer (or custom selector via `footerSelector`).
- `delay_seconds`: delay after page load.
- `exit_intent`: show when the user moves the cursor toward the browser chrome.
- `inactivity_seconds`: show after the user has been idle for the given duration.
- `click_selector`: CSS selector to bind elements that open the popup when clicked.

If more than one trigger are specified, the popup will only be shown once *all* of the triggers _(except the click trigger)_ have been satisfied.

If no triggers are specified, the popup will be shown immediately.

## Limits

Limits are optional, apply to all of the triggers except the click trigger, and can be mixed:

- `minutes`: Do not show the popup if has already been shown in the specified number of minutes
- `max`: Do not show the popup if it has already been shown the specified number of times in the current session
- `breakpoints`: Do not show the popup at the specified breakpoints (eg: do not show at "small" breakpoints)

Note that the limits are ignored for click triggers, so popups may still be shown if they are triggered by a click event or by `instance.show()`.

## Global configuration

Call `launchpop.setDefaults` to adjust behavior for all subsequent `init` calls:

```js
launchpop.setDefaults({
  autoAttachTriggers: true,
  footerSelector: "footer",
  breakpoints: { smallMax: 640, mediumMax: 1024 }
});
```

You can also listen to global events:

```js
launchpop.on("show", ({ instance, trigger }) => {
  console.log("Popup shown:", instance.id, "via", trigger);
});
```

## Testing

LaunchPop ships with a small Jest suite to guard against regressions in trigger logic and DOM parsing.

1. Install dependencies: `npm install`
2. Run the suite: `npm test`

Tests run in jsdom, so no browser is required. If you add new features or change defaults, include a focused test that covers the behavior to keep future changes safe.

## DOM-only initialization

If you rely entirely on markup, call `launchpop.init()` to scan for `[data-launchpop-id]` elements. When `autoAttachTriggers` is true, elements with `data-launchpop-triggers="<id>"` are automatically bound to matching popups.
