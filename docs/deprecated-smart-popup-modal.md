# Deprecated: Smart Popup Modal

Removed from this package when the site was consolidated onto LaunchPop. This note is the record of how Smart Popup Modal worked, so it can be revisited without the deleted files.

LaunchPop is the popup system this package ships. Smart Popup Modal was a second datastore, partial, and script that covered a smaller version of the same job. The home page and the on-page documentation used Smart Popup Modal. Nothing in the package rendered a LaunchPop item.

## Files that were removed

| Virtual name | Role |
| :--- | :--- |
| Datastore `Smart Popup Modal` (`smart popup modal`) | Editor schema |
| Datastore items `Default` and `Default 2` | Sample popups |
| `/smart_pupop_modal/v1/smart_pupop_modal.liquid` | Partial. The folder name is spelled `pupop`. |
| `/smart_popup_modal.js` | Trigger script. Storage prefix `smartpopup_`. |

`/smart_popup_modal.scss` was renamed to `/launchpop/v1/launchpop.scss`. The rules now use a `launchpop-` prefix.

## What the partial did

Home included the partial with `popup_name:"Default"`. The partial loaded every Smart Popup Modal item, kept the one whose name matched `popup_name` (`Default` when the argument was omitted), and rendered one dialog.

The dialog carried `data-popup-id`, `data-scroll-percent`, `data-scroll-relative-footer`, `data-delay-seconds`, `data-exit-intent`, `data-minutes-limit`, `data-max-shown`, and `data-hide-breakpoints`. Content followed `content_type`:

- `image` — an `<img>` of `popup_image`
- `html` — `html_content`
- `form` — `form_title`, `form_description`, and `popup_form`

It attached `/smart_popup_modal.js` and the stylesheet. The comment at the top of the partial still named `/js/launchpop.js` and said every trigger had to be met. The script and the on-page documentation said any one trigger was enough.

## Trigger behavior the script actually ran

`/smart_popup_modal.js` treated a trigger as configured only when its number was greater than zero, or when exit intent was on. A delay of `0` counted as no delay.

- With no configured trigger, the dialog opened on load.
- With one or more configured triggers, it opened when any one of them happened. Unconfigured triggers were marked already satisfied, and `tryShow` ran only from a configured trigger (or immediately when none were configured). The first configured trigger to fire opened the dialog.
- Scroll percent used the distance to a `footer` element when "scroll relative to footer" was on, and the document bottom otherwise.
- Exit intent was the pointer leaving through the top of the window (`mouseout` with no `relatedTarget` and `clientY <= 0`).

The Triggers group on the datastore said the opposite: if several triggers were set, all of them had to be satisfied.

## Limits the script actually ran

Screen size was `small` at 767px or below, `medium` at 1199px or below, and `large` above that. `hide_on_breakpoints` was split on commas.

`minutes_limit` stored `smartpopup_lastShown_<popup id>` in `localStorage` and skipped the dialog when the last open was more recent than that many minutes.

`max_shown` stored `smartpopup_count_<popup id>` in `sessionStorage` and skipped the dialog when the count was already at that number. The count lived for the browser tab session.

`popup_id` was the storage key. When it was empty, the script used the item id. Close was the close button, a click on the overlay, or Escape.

## Datastore fields

| Group | FieldID | Type | Notes |
| :--- | :--- | :--- | :--- |
| Content | `content_type` | radio | `image`, `html`, `form`. Default `image`. Required. |
| Content | `popup_image` | image | Shown when content type is image. Required in that case. |
| Content | `html_content` | html | Shown when content type is html. Required in that case. |
| Content | `form_title` | text | Shown when content type is form. |
| Content | `form_description` | textarea | Shown when content type is form. |
| Content | `popup_form` | form | Shown when content type is form. Required in that case. |
| Triggers | `scroll_percent` | text | Number, upper bound 100. |
| Triggers | `scroll_relative_to_footer` | checkbox | Shown when scroll percent is set. |
| Triggers | `delay_seconds` | text | Number, upper bound 120. |
| Triggers | `exit_intent` | checkbox | |
| Limits | `minutes_limit` | text | Number. |
| Limits | `max_shown` | text | Number, upper bound 10. |
| Limits | `hide_on_breakpoints` | checkboxlist | `small`, `medium`, `large`, with labels. |
| — | `popup_id` | text | Shared limit key. |

The numeric validators on scroll percent, delay, minutes, and max shown used a `gt` value of a single space. LaunchPop's matching validators use `0`.

## Sample items

Both items used the image `1131w-4V_IgoozgPc.webp` (image GUID `9b8d5029-a7e0-4878-ba35-5677c6aeabf4`). The image bytes were not in the export.

**Default** (item GUID `3598492e-8a85-40ad-84be-d2382fe2988c`)

- `content_type`: `image`
- `scroll_percent`: `30`
- `scroll_relative_to_footer`: true
- `exit_intent`: true
- `popup_id`: `1222`
- `delay_seconds`, `minutes_limit`, and `max_shown` were empty

Under the script, this opened at 30% scroll toward the footer, or on exit intent, whichever came first.

**Default 2** (item GUID `d2117e5b-e149-4fe3-b73d-beec88a9e9cc`)

- `content_type`: `image`
- `delay_seconds`: `0`
- `popup_id`: `11`

A delay of `0` was not a trigger, and nothing else was set, so the script opened this on load. Home did not include it.

## How this differed from LaunchPop

LaunchPop's script opens only when every configured trigger has been met. It also has scroll pixels, idle time, a click target, a focus trap, and one open dialog at a time. Its page-count fields (`min_pages`, `max_pages`) were never read by `/launchpop/v1/launchpop.js`. Those differences are why Smart Popup Modal was removed instead of being kept beside LaunchPop.
