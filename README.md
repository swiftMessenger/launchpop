# launchpop

LaunchPop shows one accessible popup from `data-launchpop-*` attributes or from `launchpop.register()`.

Version 2 changes two defaults from 1.x:

- Several automatic triggers open on the first one. Set `data-launchpop-trigger-mode="all"` when every trigger must happen.
- Minutes and maximum shows are stored together in `localStorage` under the key `launchpop`, and that record is shared by every tab. Version 1 keys (`launchpop_lastShown_*` and `launchpop_sessionCount_*`) are not read.

## Quick start

```html
<div id="newsletter" data-launchpop-id="newsletter" aria-label="Newsletter signup" role="dialog" aria-hidden="true">
  <button data-launchpop-close>&times;</button>
</div>

<button data-launchpop-triggers="newsletter">Open newsletter</button>

<script src="code/launchpop/v1/launchpop.js"></script>
```

The script initializes on `DOMContentLoaded`. Opt out before it loads:

```html
<script>window.LAUNCHPOP_AUTO_INIT = false;</script>
<script src="code/launchpop/v1/launchpop.js" data-launchpop-auto-init="false"></script>
<script>
  launchpop.init();
</script>
```

## Triggers

Automatic triggers are scroll percent, scroll pixels, delay, exit intent, and idle. A missing, blank, or zero value is not a trigger. With no automatic trigger and no click selector, the popup opens on load.

`any` is the default. `all` waits until every configured automatic trigger has happened:

```html
<div
  data-launchpop-id="both"
  data-launchpop-trigger-mode="all"
  data-launchpop-scroll-percent="50"
  data-launchpop-delay-seconds="5"
  aria-hidden="true"></div>
```

The same switch is `triggerMode: "all"` in `launchpop.register()`.

Click is separate. A `data-launchpop-click-selector` opens immediately, including after the popup has been closed. It still respects screen size. It does not wait for the automatic triggers, and the time and view-count limits do not block it. If the screen size excludes the popup, a click on a link is left alone so the link can navigate.

Scroll percent and scroll distance measure the document. A page that cannot scroll satisfies a scroll trigger immediately.

```js
launchpop.setDefaults({ scrollSelector: ".main-scroll" });
```

When that selector matches an element, scroll is measured on that element. A blank value, or a selector that matches nothing, keeps the document.

`data-launchpop-scroll-relative-to-footer` measures the percent or pixel distance until the footer meets the bottom of the viewport. The default footer selector is `footer`. A popup can set `data-launchpop-footer-selector`.

## Limits

- `data-launchpop-minutes-limit` — do not auto-open if this id was shown in the last N minutes.
- `data-launchpop-max-limit` — do not auto-open after this id has been shown N times in the current visit.
- `data-launchpop-hide-small`, `data-launchpop-hide-medium`, `data-launchpop-hide-large` — skip that screen size. Small is at or below 767, medium is at or below 1199 and above small, and large is wider. Resize checks again.

`launchpop.show()` and a click skip the minute and count limits.

When the page includes `data-launchpop-session`, that value is the visit. A Marketpath template writes it from the CMS session. Without it, a visit lasts until an hour after the last page that loaded this script. A new visit starts the counts over.

## JavaScript

```js
const instance = launchpop.register({
  id: "newsletter",
  element: document.getElementById("newsletter"),
  triggers: { delay_seconds: 5 }
});
```

Instance methods: `show`, `hide`, `disable`, `restore`, `destroy`, `tryShow`, `on`, `off`. `destroy()` does not remove the element from the page.

Global methods: `init`, `register`, `disable`, `restore`, `on`, `off`, `getDefaults`, `setDefaults`.

```js
launchpop.setDefaults({
  autoAttachTriggers: false,
  footerSelector: "footer",
  scrollSelector: "",
  breakpoints: { smallMax: 767, mediumMax: 1199 }
});
launchpop.init();
```

`init({ root, autoAttachTriggers, breakpoints })` scans for `[data-launchpop-id]`. `init({})` sets `autoAttachTriggers` to false. Set `footerSelector` and `scrollSelector` with `setDefaults`.

Events on an instance and on `launchpop`: `show`, `hide`, `disable`, `restore`, `destroy`.

## Marketpath CMS

This repository is also a portable Marketpath site package. The dialog partial is `code/launchpop/v1/_launchpop.liquid`. The editor fields are the `LaunchPop` datastore. Demo pages live under `content/articles/`. The demo shell loads Bootstrap 5.2.3 from the CDN in `code/_header.liquid`.

To bundle the assets on a site that already has its own stylesheet and script, import `/launchpop/v1/launchpop.scss` from the site stylesheet and add `/launchpop/v1/launchpop.js` to the main script's post-includes, then set `omit_launchpop_css` and `omit_launchpop_js` before the partial runs.

## Tests

```powershell
npm test
```

The suite uses Node's built-in test runner. There are no npm dependencies.
