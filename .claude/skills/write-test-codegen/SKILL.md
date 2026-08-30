---
name: write-test-codegen
description: Record a new Playwright spec for apps/demo using Playwright's built-in codegen recorder. The user clicks through the flow in a controlled browser; Claude Code converts the recorded code into a polished spec under apps/demo/tests/e2e/. Trigger when the user says "record a test", "write a test from codegen", "record a flow", or "/write-test-codegen". Also trigger as the default authoring path when the user wants to write tests for a flow they already know how to perform.
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# Record a Playwright spec via codegen

## When to use

The user wants to author a new spec for `apps/demo` by clicking through the flow themselves in a Playwright-controlled browser. Faster than narration for flows the user already knows how to perform; the user produces a raw recording, Claude Code polishes it into a stable spec.

## Workflow

### 1. Check the dev server

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

If `200`: the server is up. Skip step 2. If empty / not 200: boot it in step 2.

### 2. Boot the dev server (if not already running)

```bash
just d
```

Run this in the background (the dev server is a long-running process). Wait until the Next.js `Ready in <ms>` log appears before proceeding — usually 5-15s. Don't run codegen against an empty port.

### 3. Launch codegen

```bash
just tec
```

This opens a Playwright-controlled Chromium pointed at `localhost:3000` plus a sidecar Playwright Inspector window. The Inspector shows generated Playwright code in real time as the user interacts with the page.

**Hand off to the user with this exact prompt:**

> Codegen is running. Click through the flow you want to test in the browser. The Playwright Inspector shows the generated code on the right as you interact. When you're done:
>
> 1. Hit "Copy" in the Inspector.
> 2. Paste the recording back here.
> 3. Add a one-line **intent** per assertion you care about — e.g. "Continue button is disabled until amount ≥ $3" — so I know what to assert (codegen only captures clicks, not assertions).
>
> I'll wait.

### 4. Wait for the user's paste

Do NOT proceed until the user has shared the recording. The recording will be a TypeScript snippet (likely `await page.click(...)`, `await page.fill(...)`, etc.). The user may also paste intent bullets describing expected outcomes.

### 5. Polish the recording into a stable spec

Apply these transforms in order:

- **Selectors**: replace fragile selectors (`getByText`, raw CSS, `nth(...)`) with `getByRole` (preferred), `getByTestId`, or `getByLabel`. If a target node lacks a stable handle, add a `data-testid` to the demo source in the same PR — it becomes a contract from then on.
- **Imports**: import from `~/lib/test`, NEVER from `@playwright/test` directly. The shared fixture injects the Vercel bypass header + hides the Next dev-overlay portal.
- **Structure**: wrap in a `test.describe()` named after the feature. One `test()` per intent bullet, not one giant test.
- **Waits**: use `expect(...).toBeVisible()` with sensible timeouts. NEVER `networkidle` — the demo opens persistent wagmi/Privy sockets that never idle.
- **Mock-mode opt-in**: if the spec needs the deposit/withdraw CTAs, the launch card requires opt-in first:
  ```ts
  const mockOptIn = page.getByRole("button", { name: /Continue with mock data/i });
  if (await mockOptIn.isVisible()) {
      await mockOptIn.click();
  }
  ```
- **Dual-mounted card**: the preview stage cross-fades a desktop and a mobile-mockup card by leaving both mounted. `getByTestId("gateway-launch-card")` and `getByTestId("launch-buttons")` match twice — use `.first()`.
- **Mock deposit hash**: the mock driver rotates the hash on every trigger. NEVER assert hash equality across renders; assert tx state instead.

### 6. Pick the right directory + file name

| Category | Directory |
|----------|-----------|
| Playground / shell / layout | `apps/demo/tests/e2e/tests/playground/` |
| Flows (deposit / withdraw / transfer) | `apps/demo/tests/e2e/tests/flows/` |
| Responsive / viewport | `apps/demo/tests/e2e/tests/responsive/` |

File name: kebab-case + `.spec.ts` (e.g. `deposit-happy-path.spec.ts`).

### 7. Write the spec, then validate locally

```bash
just te --grep "<scenario name>"
```

If it fails, debug → fix → re-run. Don't ship a red spec.

### 8. Report back to the user

- **Path** of the new spec.
- **Pass / fail** status.
- **Testids** added to demo source (so they know what's now part of the contract).
- **One-line summary** of what's covered.

## Reference

Full E2E authoring guide: [`apps/demo/tests/e2e/README.md`](../../../apps/demo/tests/e2e/README.md).
