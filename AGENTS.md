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
- This project currently does not have any automated tests. These will need to be added in the future. Once the automated tests are added, we need to switch to a test-driven-development approach (write tests first, verify that the test fails, then write code that fixes the test, then verify that the test passes).

## Pull requests
- Summarize user-visible changes and important implementation notes in the PR body. Mention any manual testing performed or that needs to be performed.
- Keep commit messages concise and imperative.
