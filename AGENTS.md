# Contributing

## Layout

- `code/launchpop/v1/launchpop.js` is the library. It is plain ES5 and has no dependencies. `package.json` `"main"` points here. Do not add a second copy at the repo root.
- `code/launchpop/v1/launchpop.scss` is the dialog stylesheet. Keep the nested parent selectors. The file name stays `.scss`.
- `code/launchpop/v1/_launchpop.liquid` renders a LaunchPop datastore item. Page counts are decided here, before the script runs.
- `datastores/launchpop.json` is the editor schema. Items live in `datastores/launchpop/`.
- `content/` holds the demo articles, the sample form, the image sidecar, and the image preset.
- `tests/launchpop.test.js` is the regression suite.
- `docs/deprecated-smart-popup-modal.md` records the popup system this package replaced. Leave it as history.

## Library changes

- Write a failing test in `tests/launchpop.test.js` first, then change the script.
- Run `npm test`. It uses `node --test` and does not need a browser or Jest.
- Keep the public markup attributes stable. A new behavior that changes `any` versus `all`, storage keys, or click `preventDefault` is a major version.
- Update `README.md` when the public API or a default changes.

## CMS package

- Do not invent GUIDs. Do not hand-edit `.guid-map.json` or `.name-map.json`.
- Do not commit `artifacts/` or `.import-stamp.*.json`.
- Demo CDN stylesheet and script URLs are absolute `https://` URLs with no slash before the scheme.
