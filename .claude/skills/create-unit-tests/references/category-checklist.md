# 7-Category Test Brainstorming Checklist

A thinking tool, not a file structure. Walk through each category below for the code under test and write down concrete test cases as they come up. Group `describe` blocks in the test file by behavior or feature, the way nearby tests in the project already do — the categories live in your inventory, not in the file's headings.

**Skip ruthlessly.** Each category is a *prompt*, not a *quota*. Only write a test when it would actually catch a bug or document a real contract. For trivial code, most categories will (and should) be skipped — Performance and Type Safety especially earn their place rarely. Defensive tests for inputs the type system already forbids are usually noise. When in doubt: if you can't say in one sentence what bug a test would catch, don't write it. Five sharp tests beat fifteen ceremonial ones.

If a category is skipped, say so in the final report's Coverage Summary with a one-line reason ("Performance — pure synchronous transform, no scale claim"). Skipping silently is how gaps hide; skipping with a reason is how proportionality is communicated.

---

## 1. Happy Path

The bread-and-butter case — typical inputs, expected outputs.

**Ask yourself:**
- What does a normal, well-formed call look like?
- For each public export, what's the *primary* behavior in one sentence? Test that.
- If there are multiple "normal" code paths (e.g. cached vs uncached, controlled vs uncontrolled), each gets its own happy-path test.

**Examples:**
- `add(2, 3)` returns `5`
- `formatDate(new Date("2025-01-01"))` returns `"Jan 1, 2025"`
- `<Button>Click</Button>` renders a button with text "Click"
- `useToggle()` returns `[false, toggleFn]` initially

**Smell:** if you have only happy-path tests, the suite is half-done.

---

## 2. Edge Cases

Boundaries, corners, and "what if the input is X" scenarios. This is where most real bugs live.

**Ask yourself for each input:**
- What's the smallest valid value? (`0`, `""`, `[]`, `{}`)
- What's the largest? (`Number.MAX_SAFE_INTEGER`, very long strings, deeply nested objects)
- What's at the boundary of branches? (`if (x > 0)` → test `0`, `1`, `-1`)
- What about exact threshold values? (timeouts at exactly the limit)
- What about empty collections, single-element collections, unicode strings, multi-byte characters?
- For dates/times: leap years, DST transitions, timezone offsets, epoch (`new Date(0)`)
- For numbers: `0`, `-0`, `NaN`, `Infinity`, `-Infinity`, `Number.EPSILON`, fractional vs integer
- For arrays: empty, single item, duplicates, sparse arrays, frozen
- For objects: empty, prototype-less (`Object.create(null)`), with inherited properties
- For strings: empty, whitespace-only, with newlines, with emojis, with right-to-left scripts, very long

**Examples:**
- `slice(arr, 0, 0)` returns `[]`
- `slice(arr, 0, arr.length + 100)` returns the full array (or whatever the contract is)
- `formatBytes(0)` returns `"0 B"` (not `"0.0 B"`)
- `<Counter initial={0} />` correctly disables the decrement button

**Smell:** if every test uses similar "round" inputs, you're testing the inside of the curve, not the edges.

---

## 3. Negative Tests

What happens when inputs are *invalid* but the code still has to handle them gracefully?

**Ask yourself:**
- What if the input is the wrong type? (`null`, `undefined`, `{}` instead of an array)
- What if a required field is missing?
- What if there are extra/unknown fields? (do they pass through? get rejected? get stripped?)
- What if multiple invalid signals coexist? (negative count *and* missing user)
- For TypeScript code: what does the runtime do if the type contract is violated (`as any`)? Document the boundary's true behavior.

**Examples:**
- `parseConfig({})` — what's the contract? Throw? Return defaults?
- `divide(10, 0)` — `Infinity`? `NaN`? `throw`?
- `<Input value={undefined} onChange={undefined} />` — does it crash?

**Distinction from Error Handling (next category):** Negative tests verify the *response* to bad input. Error Handling verifies the *error machinery* — error types, messages, recovery, propagation.

**Smell:** if no test feeds in `null`/`undefined`/wrong-type input somewhere, you don't yet know what the code does at the boundary.

---

## 4. Error Handling

Every `throw`, every rejected promise, every error-returning branch needs a test.

**Ask yourself:**
- Does every `throw` in the source have a matching test?
- Does every `catch` block? (How do you trigger the caught path?)
- Are error *types* asserted, not just that something threw? (`expect(err).toBeInstanceOf(ValidationError)` beats `expect(() => ...).toThrow()`)
- Are error *messages* checked when they're part of the contract? (e.g. user-facing messages, codes consumers will switch on)
- Does the error include useful context? (field names, codes, `cause` chain)
- After an error, is state still consistent? (no leaked locks, no half-updated objects, listeners removed)
- Is logging or observability invoked appropriately?

**Examples:**
- `await expect(getUser("missing")).rejects.toBeInstanceOf(NotFoundError)`
- `expect(() => parseConfig({ port: "x" })).toThrow(/port must be a number/)`
- After a failed `commit()`, `transaction.state` is `"rolled-back"`
- A failed fetch logs once at the `error` level (verified via spy)

**Smell:** the suite passes 100% but has zero `rejects` or `toThrow` assertions. Almost certainly missing coverage.

---

## 5. Performance and Scale

Often skippable for unit tests, but worth a deliberate decision.

**Ask yourself:**
- Is there a documented complexity guarantee? (O(n), O(log n)) — assert it loosely with a "doesn't choke on N items" test.
- Does the code allocate per-call? (e.g. closures, regex compilation) — test that it can be called millions of times without leaking.
- Are there caching/memoization claims? — verify a cache hit doesn't recompute (mock the inner function and count calls).
- Is there a back-pressure or throttling contract? — test that excess calls collapse to one.

**Examples:**
- `memoize(fn)`: calling 100 times with same args invokes `fn` exactly once
- `processBatch([...10_000])` completes within a generous timeout (say, 500ms) — guards against accidental O(n²)
- A debounce of 100ms collapses 1000 rapid calls into 1 invocation

**Skip when:** the code is a simple synchronous transformation with no scale claims. Note this in the Coverage Summary.

**Smell:** code with explicit "must be fast" or "memoized" docs but no performance test.

---

## 6. Type Safety

Catches regressions in TypeScript signatures.

**Ask yourself:**
- Are there generic type parameters that should propagate correctly? (e.g. `useState<number>` returning `[number, ...]`)
- Are there discriminated unions where wrong narrowing would break consumers?
- Are there `as const` or branded types whose contract callers depend on?
- Is there a known footgun where a previous refactor broke the signature?

**Examples:**
```ts
import { expectTypeOf } from "vitest";

expectTypeOf(formatId("abc")).toEqualTypeOf<string>();
// @ts-expect-error: must accept only strings
formatId(123);
```

**Skip when:** the function has a trivial signature with no generics or unions. Don't add type tests for `function add(a: number, b: number): number` — they earn nothing.

**Smell:** you find yourself reaching for `as any` or `// @ts-ignore` to make a test compile — that's a sign the type contract is wrong, not the test.

---

## 7. State and Side Effects

For anything stateful: hooks, components, classes, modules with module-level state.

**Ask yourself:**
- For each transition (mount, update, unmount), what's the expected state shape?
- Do effects clean up? (event listeners, timers, subscriptions, AbortControllers)
- Are external calls fired the *right number of times* — and only when expected? (e.g. an effect should fire once, not on every render)
- Does prop change trigger the right re-render path?
- For controlled vs uncontrolled: does the component honor each correctly without crossing wires?
- For modules with state: does it reset between tests? Is the test passing only because of state from the previous test?
- For event emitters: are listeners removed when expected?
- For caches: is invalidation correct?

**Examples:**
- `useFetch(url)` calls `fetch` once on mount; calling `refetch()` calls it a second time
- A modal's `onClose` is called when the user presses Escape *and* the listener is removed when the modal unmounts
- After `unmount()`, the in-flight request is aborted (verify `AbortController.abort` was called)
- A subscription module: `subscribe` adds a listener, `unsubscribe` removes it, calling `unsubscribe` twice is safe

**Smell:** a hook test that never asserts on `useEffect` cleanup is incomplete. A component test that never tests unmount probably leaks.

---

## Cross-cutting prompts

After walking the 7 categories, run these final sweeps. Each one is a classical test-design technique mapped to questions the 7 categories alone don't always surface.

### Branch coverage sweep
- **Read the source one more time.** Did any branch (`if`, `else if`, ternary, `switch`, short-circuit `&&`/`||`) not get a test?
- **Search for `TODO`, `FIXME`, `HACK`** in the source — they often point to known gaps.
- **Look at recent git blame** — was anything recently fixed without a regression test? Add one.

### Decision tables (for code with 2+ independent boolean/enum conditions)
If a function's behavior depends on the combination of multiple flags or enum values (e.g. `isAdmin && isLoggedIn && hasPaid`), draw the truth table. Cover every row, or document why a covering subset (e.g. pairwise/all-pairs) is sufficient.

```
isAdmin | isLoggedIn | hasPaid | expected
--------|------------|---------|---------
  T     |     T      |    T    | full access
  T     |     T      |    F    | admin override (no payment needed)
  ...
```

Decision-table testing (an ISTQB primary technique) catches combinatorial bugs the happy path misses — for example, the case where isAdmin=true silently bypasses a check that's only reached when isAdmin=false.

### State-transition sweep (for state machines, workflows, finite-state objects)
- List all states and all transitions explicitly.
- Test each *valid* transition produces the expected next state.
- Test at least one *invalid* transition is rejected (or asserts loudly).
- For each transition with a guard condition, test the guard both when satisfied and when violated.
- For complex machines, consider 0-switch coverage (every transition exercised at least once) as the floor and 1-switch coverage (every pair of transitions exercised) as the ceiling.

### Concurrency and idempotency
- What happens if this is called twice in quick succession? (Double-click on a "submit" button; React strict mode mounting effects twice.)
- What if calls happen in reverse order? (Stale promise resolves after a newer one.)
- What if it's called after unmount/cleanup? (`AbortController` should have aborted; listener removed.)
- Is the operation idempotent? (Calling `subscribe` twice — does it duplicate, deduplicate, or throw?)
- Race-condition bugs almost never appear in happy-path tests; you have to ask explicitly.

### Resource lifecycle pairs
For every `acquire`, locate the matching `release`. Verify both:
- The pair is balanced (every acquire eventually releases, even on error paths).
- A second acquire+release works (no permanent state from the first).
- Common pairs: `subscribe`/`unsubscribe`, `addEventListener`/`removeEventListener`, `AbortController`/`abort`, `setInterval`/`clearInterval`, file open/close, lock acquire/release.

Missing-release bugs leak resources, listeners, and timers. They show up in production as memory growth or zombie effects, not as failing tests — unless you explicitly test for them.

### Trust boundaries
Does any input cross a security boundary?
- User input → DB query (SQL injection)
- User input → DOM (XSS)
- User input → `eval` / `Function` constructor / dynamic `import` (RCE)
- User input → file system path (path traversal)
- User input → URL / fetch (SSRF)

If any of the above is in scope, write at least one negative test with a known-bad input (e.g. `<script>`, `'; DROP TABLE`, `../../etc/passwd`, `file://`) and assert the code rejects or sanitizes it.

### Property-based opportunities
Is there a *property* the code should satisfy across all valid inputs, not just specific examples?
- **Round-trip:** `parse(format(x)) === x`
- **Idempotence:** `f(f(x)) === f(x)`
- **Commutativity:** `f(a, b) === f(b, a)`
- **Monotonicity:** `a < b ⇒ f(a) ≤ f(b)`
- **Length preservation / boundedness:** `output.length ≤ input.length`

If yes, reach for `fast-check` instead of writing 12 example tests. One property catches infinitely many cases — including the ones you never thought to enumerate.

### API surface sweep
- **Look at the public type signature.** Could a consumer call this in a way no test currently covers? (Optional argument left out, sentinel value passed, generic narrowed unexpectedly.)
- **What would a *naive* caller do?** Test that path — it's the most common real-world usage.

If any of these sweeps surfaces a missing test, add it now. If you find a *bug* (test fails against current source), surface it in the Implementation Weakness Report — don't quietly skip the test, and never rewrite the assertion to match buggy output ("cementing the bug").
