---
name: write-test-annotate
description: Author a Playwright spec for apps/demo by visually annotating the live page — user draws boxes on elements and types comments per region. Best for visual, layout, or UI-correctness assertions where pointing is faster than typing prose. Trigger when the user says "draw on the page to test X", "annotate to write a test", "review the UI and write tests", or "/write-test-annotate".
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# Author a Playwright spec from page annotations

## When to use

User wants to point at things visually instead of describing them. They draw rectangles around elements and type comments per region (e.g. "this button should disable when amount < $3", "this card should disappear 2s after success"). Claude Code receives the annotated screenshot + region snapshots + notes and writes the spec.

Particularly good for:
- Visual / layout assertions ("this element should not overflow at 390×844").
- Multi-element correlations ("when X is visible, Y should be hidden").
- Reviewing rendered states and codifying the parts that matter into specs.

## Prerequisites

- `playwright-cli` globally installed.
- `PLAYWRIGHT_MCP_CONFIG=~/.config/playwright-cli/cli.config.json` available.

## Workflow

### 1. Check / boot the dev server

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

If not 200, boot with `just d` and wait for `Ready in <ms>`.

### 2. Open the live page in headed mode

```bash
PLAYWRIGHT_MCP_CONFIG=~/.config/playwright-cli/cli.config.json \
playwright-cli open http://localhost:3000 --headed
```

If the user wants to test a non-default state (e.g. after mock-mode opt-in), navigate there FIRST via `playwright-cli click eN` calls before launching annotation mode. Snapshot to identify refs.

### 3. Launch annotation mode

```bash
PLAYWRIGHT_MCP_CONFIG=~/.config/playwright-cli/cli.config.json \
playwright-cli show --annotate
```

**Hand off to the user with this exact prompt:**

> The annotation overlay is open on the live page. For each thing you want tested:
>
> 1. Draw a rectangle around the element.
> 2. Type a comment in that region — what should be true about this element (e.g. "should be disabled when input is empty", "should fade out 2s after click").
>
> You can mark as many regions as you want. When done, close the annotation window — I'll receive the annotated screenshot, the snapshot of each marked region, and your comments, and write the spec from there.

### 4. Wait for the user

The `show --annotate` call blocks until the user closes the annotation window. When it returns, you'll receive:
- The annotated screenshot path.
- Per-region accessibility-tree snapshots.
- The user's comments per region.

### 5. Parse each annotation

For each region:

- **Identify the element** from the region's accessibility-tree snapshot. Look for `role`, accessible name, `[ref=eN]`, and any `data-testid` mentioned.
- **Map the comment to a Playwright assertion**:

  | User comment shape | Playwright assertion |
  |---|---|
  | "should be visible" | `await expect(el).toBeVisible();` |
  | "should be hidden" | `await expect(el).toBeHidden();` |
  | "should be disabled" | `await expect(el).toBeDisabled();` |
  | "should say X" | `await expect(el).toHaveText(/X/i);` |
  | "should disappear after Ns" | poll with `expect.poll(...)` |
  | "should not overflow" | `expect(scrollWidth - innerWidth).toBeLessThanOrEqual(1)` |

- If the comment is ambiguous, ask one clarifying question before writing.

### 6. Close the CLI session

```bash
PLAYWRIGHT_MCP_CONFIG=~/.config/playwright-cli/cli.config.json \
playwright-cli close
```

### 7. Write the spec

Same conventions as `write-test-codegen`:
- Import from `~/lib/test`.
- `test.describe()` + one `test()` per annotated region or per logical group of related assertions.
- Use `getByTestId` / `getByRole`; add testids to demo source if needed.
- No `networkidle`.

### 8. Save to the right directory

Annotation specs usually fit under:
- `apps/demo/tests/e2e/tests/playground/` for layout / theme / chrome assertions.
- `apps/demo/tests/e2e/tests/responsive/` for viewport-conditional assertions.
- `apps/demo/tests/e2e/tests/flows/` for in-dialog visual checks.

### 9. Validate + report back

```bash
just te --grep "<scenario>"
```

Report:
- Spec path.
- Pass / fail.
- Testids added.
- One-line summary.

## Reference

Full E2E authoring guide: [`apps/demo/tests/e2e/README.md`](../../../apps/demo/tests/e2e/README.md).
