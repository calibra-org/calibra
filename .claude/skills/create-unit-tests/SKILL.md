---
name: create-unit-tests
description: Generate or update comprehensive Vitest unit tests for utilities, hooks, modules, and components. Use proactively whenever the user asks to write tests, add tests, improve coverage, fill coverage gaps, exercise error paths, validate edge cases, harden a function/component/module, or create a test suite for new or untested code. Triggers on phrases like "write tests for X", "test this", "add unit tests", "increase coverage", "exhaustive tests", "test the error handling", "test these edge cases", or when a user finishes implementing something and asks for it to be tested. Produces a behavior inventory, full Vitest implementation, scoped verification, and a final report covering coverage, implementation weaknesses, risks, and recommendations.
---

# Create Unit Tests

Write Vitest unit tests that catch the bugs the source author missed — not just the ones they remembered to handle. Treat tests as a second pair of eyes on the implementation: every test should encode a behavior the author intended, *and* every behavior the author forgot should show up as either a failing test or a flagged risk in the final report.

This skill is for **generating new tests** or **extending existing suites** for utilities, modules, hooks, and components. It is framework-agnostic over the Vitest surface; see `references/test-patterns.md` for concrete patterns and `references/category-checklist.md` for the brainstorming checklist.

## When this skill applies

Trigger when the user asks to:
- Write tests for a file/module/function/hook/component
- Improve coverage, fill gaps, or "make sure this is tested"
- Exercise error paths, edge cases, or boundary conditions
- Harden code that just changed
- Add tests for a bug that just got fixed (regression test)

Don't trigger for: integration/e2e tests against real services, performance benchmarks, or smoke tests against staging — those have different rigor and tooling.

## Workflow

The order matters. Don't skip the inventory step — it's what makes the difference between "tests that pass" and "tests that catch bugs."

### Step 1 — Locate and read the source

Identify the target file(s) and any existing related tests. Read both fully:
- The source — every public export, every branch, every async path, every error throw, every external call.
- Any existing tests — to learn the project's conventions (helpers, mock setup, naming) and to avoid duplicate coverage.

Also detect the project's test setup before writing anything:
- Find `vitest.config.*` (or `vite.config.*` with a `test` block) — note `environment` (jsdom/node), `setupFiles`, `include` glob, path aliases.
- Find existing `*.test.*` or `*.spec.*` files near the target — match their style.
- Find the package's test command (e.g. `pnpm test`, `npm test`, `pnpm --filter <pkg> test`) from `package.json`. You'll need it for verification.

### Step 2 — Behavior inventory (required)

Before writing a single test, produce a numbered list of every observable behavior of the code under test. This step is non-negotiable for anything beyond a trivial pure function — it's how you avoid missing branches.

For each public export, capture:
- **Inputs** — argument shapes, types, defaults, optional vs required
- **Outputs** — return values, resolved/rejected promise shapes
- **Branches** — every `if`/`else`, every ternary, every `switch` arm, every short-circuit
- **Side effects** — DOM mutations, network calls, timers, storage writes, event emissions
- **External dependencies** — anything that needs mocking (fetch, fs, Date, Math.random, modules, context providers)
- **Error paths** — every `throw`, every rejected promise, every error-returning branch
- **State transitions** — for hooks/components: mount, update, unmount, prop changes, controlled vs uncontrolled. For state machines, list states *and* both valid and invalid transitions plus any guard conditions.
- **Invariants the source assumes silently** — what does the function trust the caller to have validated but never checks? (e.g. "`x.length > 0`", "`config has been initialized`", "the array is sorted") These are bug magnets — every silent assumption deserves at least one test that exercises it.
- **Pre/postconditions** — one expected truth before each public call, one after. Forces you to think about the contract, not just the code.
- **Resource lifecycle pairs** — for every `acquire`, where's the matching `release`? (`subscribe`/`unsubscribe`, `addEventListener`/`removeEventListener`, `AbortController`/`abort`, file open/close.) Missing or unbalanced pairs leak resources and produce hard-to-find flake.
- **Concurrency assumptions** — what happens if this is called twice in flight? In reverse order? After unmount? With a stale promise resolving late? Race-condition bugs almost always escape happy-path tests.
- **Trust-boundary inputs** — does any input cross a security boundary? (User input → DB query, user input → DOM, user input → `eval`, user input → file system.) Boundaries deserve negative + adversarial tests.
- **Decision tables** — for any function with 2+ independent boolean/enum conditions, write the truth table. 2 booleans = 4 rows; cover them all (or document why a covering subset is enough).
- **Numeric precision class** — does the code touch float, BigInt, integer overflow, signed zero, `NaN`/`Infinity`? Each has its own edge cases.
- **Encoding class** — does the code reason about strings? (Length vs code-point count, surrogate pairs, RTL scripts, normalization forms.) Missing encoding tests bite in production.
- **Memoization or cache claims** — if the source memoizes, the test must verify the inner function is called *exactly* once across repeated calls.

Aim for one inventory item per behavior. If a function has 3 branches and 2 thrown errors, expect ~5–7 inventory items minimum, plus edge-case items derived from the checklist (Step 3).

For trivial cases (a one-line pure utility with no branches), a 2–3 line inventory is enough. Don't pad. Use judgment.

The inventory is a thinking tool, not a deliverable. Keep it terse — bullet points, not prose. You can include it briefly in the final report under "Coverage" if it helps the user audit, but don't write it to a separate file.

### Step 3 — Brainstorm against the 7 categories

Walk the inventory through `references/category-checklist.md`. The categories are:

1. Happy Path
2. Edge Cases
3. Negative Tests
4. Error Handling
5. Performance and Scale
6. Type Safety
7. State and Side Effects

Treat them as **prompts to find missing tests**, not as required `describe` block headings. Group `describe` blocks naturally — by behavior, feature, or method — the same way nearby tests in the project are grouped. The categories live in your head and in the inventory; the file structure follows the code.

#### Don't add tests that don't earn their place

Each category is a *prompt*, not a *quota*. Only write a test when it would actually catch a bug or document a real contract. Skip whole categories — and specific tests within categories — when they would just be ceremony.

- **Performance and Scale** — skip for any function that's O(1), has no I/O, no allocations beyond the obvious, and no documented complexity claim. Don't write a "completes within 500ms" test for `add(a, b)`. Add performance tests only when the source has a *claim* worth verifying (memoization, debounce, throttle, batching, "must handle 10k items").
- **Type Safety** — skip when the signature is trivial (`function add(a: number, b: number): number` — type tests earn nothing). Add type tests only when there are generics, discriminated unions, branded types, or `as const` contracts that consumers will switch on.
- **Negative tests / "defensive" tests** — don't write a test for every conceivable invalid input. Test the boundary contract (what the function *promises* to do with bad input — throw? coerce? return default?) and stop there. A function that's documented to accept `number` doesn't need 10 tests for `null`/`undefined`/`{}`/`[]`/`Symbol`/etc.; one or two boundary tests are enough unless the source actually branches on type. Don't test internal helpers that aren't exported.
- **Error Handling** — every `throw` in the source deserves a test, but you don't need three different tests asserting the *same* throw with slightly different messages. One assertion on the error type and shape is enough.
- **Edge Cases** — pick the edges that matter for *this* function. `formatBytes(0)` and `formatBytes(-1)` are real; `formatBytes(NaN)` is real if the source might receive it; testing `formatBytes("hello" as any)` mostly tests TypeScript, not the function.

Rule of thumb: if you can't say in one sentence what bug a test would catch (or what contract it documents), don't write it. Five sharp tests beat fifteen ceremonial ones — they fail more loudly when something real breaks, and they don't bloat the diff or slow CI.

If a category is skipped entirely, say so in the final report's Coverage Summary with a one-line reason ("Performance — pure synchronous transform, no scale claim"). That makes the decision auditable rather than invisible.

### Step 4 — Implement the tests

Write `*.test.ts` / `*.test.tsx` (or `*.spec.*` if that's the project convention) using Vitest's `describe`, `it`, `expect`, `vi`. Co-locate with source unless project patterns say otherwise.

See `references/test-patterns.md` for copy-pasteable patterns covering: pure utilities, async/promises, React hooks via `renderHook`, components with `userEvent`, module mocking with `vi.mock`, fake timers, fixture factories, and test isolation.

#### Determinism rules (required)

Every test must be deterministic. A flaky test is worse than no test — it teaches the team to ignore failures. These rules are not optional:

- **No real network calls.** For non-trivial fetch surfaces, MSW (Mock Service Worker) is the modern default — it mocks at the request level, works across `fetch`/`axios`/SDK clients, and survives implementation refactors. Check whether the project already wires MSW (look for `tests/helpers/server.ts` or similar) and reuse the existing setup. For one-off calls, `vi.spyOn(globalThis, "fetch")` or `vi.stubGlobal("fetch", vi.fn())` is fine — `vi.mock` is appropriate when mocking a specific module-level client. Real network = flaky CI, slow runs, leaked credentials.
- **Fake timers for time-sensitive code.** Anything reading `Date.now()`, `Date`, `performance.now()`, `setTimeout`, `setInterval`, debounce/throttle/poll loops needs `vi.useFakeTimers()` and `vi.setSystemTime(new Date("2025-01-01T00:00:00Z"))`. Always restore in `afterEach` with `vi.useRealTimers()`. **When using `userEvent` with fake timers, you must pass `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` — otherwise `userEvent.click`/`type` will hang indefinitely.** When timer code awaits inside callbacks, use `vi.advanceTimersByTimeAsync` (not the sync version), or `vi.runAllTimersAsync()` / `vi.runOnlyPendingTimersAsync()` to drain microtasks together with the timers.
- **Seeded or mocked randomness.** Spy on `Math.random` (`vi.spyOn(Math, "random").mockReturnValue(0.5)`) and stub `crypto.randomUUID`/`crypto.getRandomValues` when used. Tests must produce the same output every run.
- **Pin timezone and locale.** Anything that touches `Date#toLocaleString`, `Intl.DateTimeFormat`, or formats currency/numbers will produce different output on a CI runner in a different region. Set `TZ=UTC` (via `vi.stubEnv("TZ", "UTC")` or the project's CI env) and pass an explicit `locale`/`timeZone` to `Intl` calls in the source-under-test.
- **Stub environment variables.** Tests that read `process.env.X` or `import.meta.env.X` directly are flake-prone and machine-specific. Use `vi.stubEnv("X", "value")` and either configure `unstubEnvs: true` in your Vitest config or restore manually in `afterEach`.
- **Reset module-level state.** If the source-under-test has module-scope state (`let cache = new Map()`, a singleton, a registered listener), call `vi.resetModules()` in `beforeEach` and re-import — otherwise the second test silently relies on the first test's state.
- **Don't depend on iteration order across engines.** When asserting on `Object.keys`, `Set`, or `Map` contents, sort first or compare as a set — JS engines preserve insertion order, but that's a fragile contract for a test to depend on across data-shape refactors.
- **Avoid `process.cwd()` and `__dirname`-relative paths in fixtures.** Use `path.join(import.meta.dirname, ...)` or pre-resolved absolute paths — otherwise the test passes locally but breaks when run from a different working directory.
- **Cleanup between tests.** Add `afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); })` and, for component tests, ensure RTL `cleanup()` runs (the project's `setupFiles` already auto-registers it when Vitest globals are enabled — confirm before adding a manual call). No state leaks across tests.

> **Vitest 4 caveat:** `vi.restoreAllMocks()` no longer restores automocks (only manual `vi.spyOn` mocks). If the project is on Vitest 4, automocked modules need explicit `vi.unmock()` or `vi.doUnmock()` per their migration guide. Check `package.json` for the installed version.

#### Test design

- **Assert on concrete outcomes.** `expect(result).toBe(42)`, `expect(mockFn).toHaveBeenCalledWith({ id: "abc" })`. Avoid weak assertions like `expect(result).toBeTruthy()`, `toBeDefined()`, `not.toBeNull()` when a precise check is possible. Tautological assertions are the most common AI-test failure mode — they pass for almost any return and provide false confidence.
- **One behavior per `it`.** If a test name has " and " or "should X, Y, and Z", split it. Otherwise a single failure stops at the first assertion and you lose information about the other branches (test smell: *Assertion Roulette*).
- **Name tests in plain English from the user's point of view.** `it("returns null when the input is empty")` beats `it("test1")` or `it("handles empty input correctly")`.
- **Keep tests independent.** No shared mutable state across tests. Use `beforeEach` to reset, not `beforeAll`, unless the cost is genuinely prohibitive. Order-dependent tests rot — they pass locally and break on shuffled CI runs.
- **Cover failure as well as success.** A suite that only tests the happy path is half-finished. Every error throw, rejected promise, and validation branch deserves a test.
- **Test behavior, not implementation.** Assert on what callers observe (return value, DOM, mock calls), not on private state, instance fields, or rendered class names. Implementation tests fail on every refactor without finding real bugs (the "change-detector" smell).
- **Don't mock what you're testing.** If you mock `fetchUser` to return `{ id: 1 }` and then assert `getUser()` returns `{ id: 1 }`, you've tested the mock setup, not the function. Mock at *boundaries* (network, file system, third-party SDKs) — not at the unit under test or at types you don't own (wrap third-party SDKs in your own thin adapter and mock the adapter).
- **Always `await` async tests.** A missing `await` makes the test pass even when the assertion would have failed — false greens are worse than reds.
- **Surface bugs, don't paper over them.** If you write a test that exposes a real bug in the source (the test fails against current code), flag it in the Implementation Weakness Report and ask the user before changing source code. Never rewrite the assertion to match the buggy output — that's "cementing the bug into the test." Never silently delete or `it.skip` the failing test either.
- **No conditional logic in tests.** No `if`/`for`/`try` driving assertions inside `it` blocks. Use `it.each` for parameterization. Branching inside a test means the test sometimes asserts and sometimes doesn't.

See `references/anti-patterns.md` for the full list of test smells and AI-test pitfalls the skill must avoid.

### Step 5 — Verify (required)

Don't claim success without evidence.

1. **Run the test file scoped.** Use the project's test command pointed at the new/edited file:
   - Monorepo with pnpm: `pnpm --filter <package-name> test -- <relative/path/to/file.test.ts>`
   - Single package: `pnpm test -- <path>` or `npx vitest run <path>`
   - If the project has a script like `test:unit`, use it.

   All tests must pass. If anything fails, fix it before reporting — either the test (if you wrote it wrong) or the source (if the test exposed a real bug; in that case, surface the bug in the report and ask the user how to proceed before changing source code).

2. **Run a scoped TypeScript check.** Don't run a whole-monorepo type check; that's slow and surfaces unrelated noise. Use `npx tsc --noEmit -p <package>/tsconfig.json` (or the project's nearest tsconfig). Always pass `-p <tsconfig>` — passing bare file paths to `tsc` causes it to ignore `tsconfig.json` entirely (lib settings, path aliases, JSX config), which produces misleading errors or false greens. If the project has a `--typecheck` Vitest script (which runs `*.test-d.ts` files), prefer it.

   The test file must type-check cleanly with no errors and no new warnings introduced by your changes.

If verification can't run for environmental reasons (missing deps, sandboxed shell, etc.), say so explicitly in the final report — don't claim success without evidence.

### Step 6 — Report

After tests are written and verified, output a final report with these four sections. Always include all four; if a section is genuinely empty, write "None identified" or "N/A" and briefly explain why. The content within each section is flexible — match the depth to what was found.

#### 1. Test Coverage Summary
- Files added/modified (with paths)
- Total tests added or updated (count)
- Categories covered (from the 7-category checklist)
- Categories deliberately skipped and why (e.g. "Performance — function is O(1) with no I/O")
- Known gaps not yet covered (and why, if it was a deliberate choice)
- Coverage delta if available (`before X.Y% / after X.Y%`) — only if you ran a coverage report; don't fabricate

#### 2. Implementation Weakness Report
What you noticed about the source while writing tests. Examples:
- Logical gaps (missing null checks, unhandled cases, off-by-one)
- Missing input validation or error handling
- Fragile assumptions (relies on specific iteration order, ignores `undefined` vs missing)
- Dead code or unreachable branches
- Cases where a test only passes because of an undocumented invariant

If you uncover an actual bug while writing tests (test fails against current source), surface it here clearly — don't silently skip the test or change the source without flagging.

#### 3. Risk Assessment
- Residual risks not covered by tests (e.g. concurrency, real-network behavior, browser-specific quirks)
- Hard-to-test scenarios that would benefit from integration or e2e coverage
- External dependency risks (API contracts, SDK versions, environment differences)

#### 4. Recommendations
- Suggested implementation hardening (input validation, error messages, types)
- Follow-up tests worth adding later (and why they were out of scope this round)
- Refactors that would improve testability (e.g. dependency injection for an inline `new Date()`)
- **Property-based testing** — if the source has a checkable property (round-trip `parse(format(x)) === x`, idempotence `f(f(x)) === f(x)`, monotonicity, commutativity, encoding length-preservation), recommend reaching for `fast-check` instead of writing 12 example tests. One property catches infinitely many cases.
- **Mutation testing** — for high-value or security-critical code, suggest a follow-up `npx stryker run` on the file to validate that the test suite actually catches code mutations. Mutation testing exposes "tests that always pass" — which line coverage cannot.

Keep the report focused on signal. If the code is genuinely solid, say so — don't manufacture weaknesses to look thorough.

## Naming and location

- Match source file naming: `foo.ts` → `foo.test.ts`, `Button.tsx` → `Button.test.tsx`
- Co-locate tests with source unless the project uses a separate `tests/` directory — follow what's already there
- Use `*.test.*` unless the project already standardizes on `*.spec.*`
- Don't introduce a new convention; match the closest existing test file in the same package

## Output contract

- Tests are written to disk in the appropriate file(s)
- All tests pass under the project's test runner
- Test files type-check cleanly
- Final response includes the 4-section report above
- The report is concise; the value is in the *content* of weaknesses/risks/recommendations, not in the report's length

## References

- `references/test-patterns.md` — copy-pasteable Vitest patterns for utilities, async, hooks, components, mocking, fake timers, fixtures, MSW, snapshot, env-var stubbing
- `references/category-checklist.md` — the 7-category brainstorming checklist with prompting questions and cross-cutting prompts (decision tables, concurrency, lifecycle pairs, trust boundaries)
- `references/anti-patterns.md` — test smells and AI-test pitfalls the skill must avoid (tautological assertion, mock-then-assert-the-mock, cementing the bug, etc.)
