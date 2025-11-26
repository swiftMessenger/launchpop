# Contributing agent guide

This repository contains the LaunchPop JavaScript library. Follow these guardrails when making changes:

## Repository layout
- `launchpop.js` — UMD bundle for the popup/trigger library; written in vanilla JavaScript with no external dependencies.
- `README.md` — Usage documentation for consuming LaunchPop in markup or JavaScript.

## Coding standards
- Stick to plain ES5/ES2015-compatible JavaScript to match the existing bundle style.
- Favor small, well-named helpers over inline logic. Keep functions pure when possible and rely on existing utilities (e.g., `safeParseInt`, `getFocusableElements`).
- Preserve accessibility-first behavior: maintain ARIA attributes, focus management, and keyboard handling. Add tests or notes when touching those areas.
- Do not wrap `require`/`import` statements in `try/catch` blocks.

## Documentation
- Update `README.md` when changing public APIs or default behavior. Keep examples runnable without a build tool.
- Document new triggers, options, or events with concise code samples.
- Update `AGENTS.md` when appropriate after making significant changes, such as when adding new build steps or dependencies.

## Testing & validation
- Automated tests live in `__tests__/` and run with `npm test` (Jest + jsdom). Install dependencies with `npm install` before running.
- When adding features or fixing bugs, write a failing test first that captures the expected behavior, then implement the change and confirm the test passes.
- Keep tests deterministic: mock timers for delay/inactivity behavior, stub storage when asserting frequency limits, and avoid relying on real timeouts or network calls.

## Pull requests
- Summarize user-visible changes and important implementation notes in the PR body. Mention any manual testing performed or that needs to be performed.
- Keep commit messages concise and imperative.
