# launchpop

LaunchPop is a lightweight, framework-agnostic JavaScript library for showing accessible popups (modals) based on flexible triggers.

## Quick start

Include the script and mark up a popup with `data-launchpop-id`:

```html
<div id="newsletter" data-launchpop-id="newsletter" aria-label="Newsletter signup" aria-role="modal" aria-hidden="true">
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

## Core Concepts
Each popup is represented by a launchpop instance, created via:
- DOM attributes on an element: `data-launchpop-id="some-id"`
- Or directly via `launchpop.register(...)`

Each instance has:
- Configuration data:
  - `id` - Used for frequency limits and click triggers. The same id may be used by multiple popups
  - `element` - The modal element to be shown/hidden
  - Information about the **triggers** and **limits**
  - `role` - The aria role to use for the modal
  - `closeOnEsc` - Whether the modal should be closed when the escape key is pressed
  - `active` - Whether the instance is currently displayed
  - `shown` - Whether the instance has been shown
  - `disabled` - Whether the instance is currently disabled
- Functions
  - `show(context)` - Shows the popup. This may be used to show the popup even if it is currently disabled. Pass in a context object to use it in the event handlers or exclude it to use the default context
  - `hide(context)` - Hides the popup. Pass in a context object to use it in the event handlers or exclude it to use the default context
  - `disable(context)` - Disables the popup. Pass in a context object to use it in the event handlers or exclude it to use the default context
  - `restore(context)` - Enables the popup. Pass in a context object to use it in the event handlers or exclude it to use the default context
  - `destroy(closeAndRemoveDomNode)` - Permanently deletes the instance and cleans up all related resources. If `closeAndRemoveDomNode` is true, the modal element will be removed from the DOM. Note that if the popup is currently active and `closeAndRemoveDomNode` is NOT true, then the modal may remain displayed even after being cleaned up
  - `tryShow(context)` - Checks if all of the triggers and limits have been satisfied and this instance is not disabled and has not already been shown, in which case it will show the popup. Pass in a context object to use it in the event handlers or exclude it to use the default context
  - `on(eventName, handler)` - Attach an event listener to the instance. The built-in events are:
    - `show` - Fired immediately after the modal is displayed
    - `hide` - Fired immediately after the modal is hidden
    - `disable` - Fired immediately after the modal is disabled. Note that this is NOT fired when all modals are disabled using `launchpop.disable()`
    - `restore` - Fired immediately after the modal is restored. Note that this is NOT fired when all modals are restored using `launchpop.restore()`
    - `destroy` - Fired immediately before the modal is destroyed
  - `off(eventName, handler)` - Detach an event listener from the instance
  - `emit(eventName, context)` - Executes the event handlers for the specified event using the provided context

Additionally, the global launchpop object has the following methods:
- `init(options)` - Initializes the launchpop library with the specified options. Possible options include:
  - `root` - The root node to check for launchpop instances to initialize. Defaults to the document body
  - `autoAttachTriggers` - Whether or not click event triggers should automatically be attached to new instances by default
  - `footerSelector` - The query selector to use for the document footer, used by popups with scroll_relative_to_footer set to true
  - `breakpoints` - An object containing the small/medium/large breakpoints to use when interpreting the breakpoint limits
    - `smallMax` - The largest screen width to interpret as a "small" device
    - `mediumMax` - The largest screen width to interpret as a "medium" device
- `register(options)` -
- `disable(context)` - Globally disbales all launchpop instances
- `restore()` - Globally restores all launchpop instances
- `on(eventName, handler)` - Attach an event listener to the global launchpop object. The built-in events are:
  - `show` - Triggered after any launchpop instance is shown
  - `hide` - Triggered after any launchpop instance is hidden
  - `disable` - Triggered after `launchpop.disable()` is run
  - `restore` - Triggered after `launchpop.restore()` is run
- `off` - Detach an event listener from the instance
- `getDefaults()` - Gets the global settings for all launchpop objects
  - `autoAttachTriggers`
  - `footerSelector`
  - `breakpoints`
    - `smallMax`
    - `mediumMax`
- `setDefaults(partial)` - Updates the global settings for all launchpop objects

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

For best results, add aria-role="modal" and aria-hidden="true" to the main popup element, which will help with accessibility for content that will be hidden on pageload.
