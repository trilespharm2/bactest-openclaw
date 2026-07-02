---
name: JS block-scope ReferenceError in bot-script
description: Why shared helpers must be hoisted to function scope; validation gap
---

In `sbStepConfigHTML(step)` (static/js/bot-script.js) each `if (step.type === …)`
branch is its own block. A `const` helper (notably `_sel`, the <select> builder)
declared inside the `metric` branch is NOT in scope in the `open_position` branch.

**Symptom:** adding an options position step crashed the bot config panel with
`ReferenceError: _sel is not defined`.

**Why it slipped through:** `node --check` only parses syntax; referencing a
block-scoped const from a sibling block is a *runtime* ReferenceError, so the
check passed. Screenshot/e2e of the actual interaction is needed to catch it.

**Rule:** shared render helpers used by more than one step branch must be declared
once at the top of `sbStepConfigHTML` (function scope), not inside a branch.
Bump the `bot-script.js?v=N` tag in static/js/main-script.js after JS changes.
