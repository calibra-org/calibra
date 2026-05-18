---
name: write-test-narrate
description: Author a Playwright spec for apps/demo by describing the flow in plain English — Claude Code drives playwright-cli against the running demo, snapshots, and writes the spec. Trigger when the user says "write a test for X" without providing a recording, "test that ...", or "/write-test-narrate". Best when the user doesn't want to leave the chat.
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# Author a Playwright spec from a narrated flow

## When to use

User describes what they want tested in prose ("test that opting into mock mode and clicking Deposit opens the dialog with an amount input"). Claude Code drives the browser via `playwright-cli`, snapshots to find selectors, and emits a polished spec. No browser-clicking required from the user.

## Prerequisites

- `playwright-cli` globally installed (check with `which playwright-cli`). If missing, fall back to the `write-test-codegen` skill and have the user record manually.
- The CLI's chromium-default config: `PLAYWRIGHT_MCP_CONFIG=~/.config/playwright-cli/cli.config.json` (pass inline on every command — the CLI defaults to system Chrome otherwise).

## Workflow

### 1. Check the dev server

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

If `200`: skip step 2.

### 2. Boot the dev server in the background (if needed)

```bash
just d
```

Wait for `Ready in <ms>` before proceeding.

### 3. Open a playwright-cli session

```bash
PLAYWRIGHT_MCP_CONFIG=~/.config/playwright-cli/cli.config.json \
playwright-cli open http://localhost:3000
```

### 4. Drive the CLI per the user's narration

For each step the user described:

- **Snapshot** the page to discover the next interaction's element ref:
  ```bash
  PLAYWRIGHT_MCP_CONFIG=~/.config/playwright-cli/cli.config.json \
  playwright-cli snapshot
  ```
  The output is YAML with `[ref=eN]` markers. Find the element matching the user's intent.

- **Execute the action**:
  - `playwright-cli click eN`
  - `playwright-cli fill eN "text" --submit`
  - `playwright-cli press Enter`
  - `playwright-cli select eN "option-value"`
  - `playwright-cli check eN` / `uncheck eN`

- **Re-snapshot** to see the new state. Refs change between snapshots — always re-read.

### 5. Capture the emitted Playwright TypeScript

Each CLI action emits a TS snippet under `### Ran Playwright code` in its output. Capture those as you go. The accumulated snippets are roughly what the spec will look like, modulo polish.

### 6. Verify each assertion

For each "the X should show Y" bullet in the user's narration:
- Take a final snapshot.
- Locate the asserted element in the YAML tree.
- Read its accessible name / text / state to confirm the user's expectation matches reality.
- If it doesn't match, STOP — tell the user what you observed instead. Don't write a spec that asserts something untrue.

### 7. Close the CLI session

```bash
PLAYWRIGHT_MCP_CONFIG=~/.config/playwright-cli/cli.config.json \
playwright-cli close
```

### 8. Polish the emitted code into a spec

Apply the same conventions as the `write-test-codegen` skill:
- Replace selectors with `getByRole` / `getByTestId`.
- Import from `~/lib/test`.
- Wrap in `test.describe()` + one `test()` per intent.
- No `networkidle`.
- `.first()` for dual-mounted launch card.
- No hash equality assertions on the mock driver.

### 9. Save to the right directory

| Category | Directory |
|----------|-----------|
| Playground / shell / layout | `apps/demo/tests/e2e/tests/playground/` |
| Flows (deposit / withdraw / transfer) | `apps/demo/tests/e2e/tests/flows/` |
| Responsive / viewport | `apps/demo/tests/e2e/tests/responsive/` |

### 10. Validate

```bash
just te --grep "<scenario name>"
```

### 11. Report back

- Spec path.
- Pass / fail.
- Testids added.
- One-line summary.
- Anything the user described that didn't match observed behavior (so they can correct either the spec or the app).

## Trade-off vs `write-test-codegen`

The user doesn't have to leave the chat. The cost: the user has to describe the flow precisely enough that Claude doesn't pick the wrong path. Vague prompts → vague tests. If the flow is unfamiliar or branched, fall back to codegen.

## Reference

Full E2E authoring guide: [`apps/demo/tests/e2e/README.md`](../../../apps/demo/tests/e2e/README.md).
Bundled playwright-cli docs: `~/.claude/skills/playwright-cli/` (especially `references/test-generation.md` and `references/spec-driven-testing.md`).
