# Test Anti-Patterns and Smells

Patterns that *look* like tests but produce false confidence, rot, or noise. Refuse to write any of these — and if you find them in existing tests, flag them in the Implementation Weakness Report.

## The classic test smells (Meszaros, xUnit Test Patterns)

### 1. Tautological Assertion (a.k.a. weak assertion)

```ts
// 🛑 passes for almost any return value — provides false confidence
expect(result).toBeDefined();
expect(result).toBeTruthy();
expect(result).not.toBeNull();
expect(typeof result).toBe("object");
```

```ts
// ✅ asserts the actual contract
expect(result).toEqual({ id: "u_1", name: "Ada" });
expect(result.amount).toBe(42);
```

**Why it's bad:** the most common failure mode of AI-generated tests. The test passes whether the function works or not.

**Rule:** if a precise assertion is possible, use it. `toBeTruthy()` is acceptable only for boolean returns.

### 2. Mock-then-assert-the-mock

```ts
// 🛑 the test never exercises any logic in fetchUser
vi.spyOn(api, "getUser").mockResolvedValue({ id: 1, name: "Ada" });
const result = await fetchUser(1);
expect(result).toEqual({ id: 1, name: "Ada" });
```

```ts
// ✅ mock at the boundary, assert on the unit's transformation
vi.spyOn(api, "getRawUser").mockResolvedValue({ user_id: "1", display_name: "Ada" });
const result = await fetchUser(1);
expect(result).toEqual({ id: 1, name: "Ada" }); // shape transformation is the unit's job
```

**Why it's bad:** when you mock the unit-under-test or its direct return shape, the test verifies the mock setup, not the function's logic.

**Rule:** mock at *boundaries* (network, file system, third-party SDKs). The unit under test does the work; the test asserts the work was done.

### 3. Cementing the bug into the test

```ts
// Source returns "Hello,World" (missing space) — bug.
// 🛑 test rewrites the assertion to match the buggy output:
expect(greet("World")).toBe("Hello,World");  // makes the test pass; preserves the bug forever
```

```ts
// ✅ the test asserts the correct contract; the failure flags a real bug.
expect(greet("World")).toBe("Hello, World");  // fails — surface in Implementation Weakness Report
```

**Why it's bad:** the AI failure mode where, when a test fails, the assertion gets rewritten to match the current (buggy) output. The test then locks the bug in place.

**Rule:** if a test fails because the source is wrong, surface the bug — don't change the assertion.

### 4. Assertion Roulette

```ts
// 🛑 a single failure tells you only "this test failed" — which assertion?
it("validates the user", () => {
    expect(user.name).toBe("Ada");
    expect(user.email).toMatch(/@/);
    expect(user.age).toBeGreaterThan(0);
    expect(user.role).toBe("admin");
});
```

```ts
// ✅ each assertion has its own test name
it("uses the provided name", () => expect(user.name).toBe("Ada"));
it("uses a valid email", () => expect(user.email).toMatch(/@/));
// ...
```

**Why it's bad:** when assertion 2 fails, assertion 3 never runs — you lose information.

**Rule:** one behavior per `it`. Use `it.each` for parameterization, not multiple unrelated assertions.

### 5. Mystery Guest

```ts
// 🛑 what does setupDatabase produce? where? when does it run?
it("returns active users", () => {
    const result = getActiveUsers();
    expect(result.length).toBe(3);  // 3 from where?
});
```

```ts
// ✅ all data the test depends on is visible in the test body or a named factory
it("returns active users", () => {
    const users = [makeUser({ active: true }), makeUser({ active: true }), makeUser({ active: false })];
    const result = getActiveUsers(users);
    expect(result).toHaveLength(2);
});
```

**Why it's bad:** the reader can't tell why the assertion expects what it expects without reading external setup files.

**Rule:** make the test self-explanatory. Hide irrelevant setup behind a named factory (`makeUser`); never hide *what* is being tested.

### 6. Conditional Test Logic

```ts
// 🛑 the test sometimes asserts and sometimes doesn't
it("handles mobile and desktop", () => {
    if (isMobile()) {
        expect(layout).toBe("stacked");
    } else {
        expect(layout).toBe("inline");
    }
});
```

```ts
// ✅ split into two deterministic tests
it("uses stacked layout on mobile", () => {
    setViewport("mobile");
    expect(getLayout()).toBe("stacked");
});

it("uses inline layout on desktop", () => {
    setViewport("desktop");
    expect(getLayout()).toBe("inline");
});
```

**Why it's bad:** branches in a test mean different runs may exercise different paths — the result of any single run carries less information.

**Rule:** no `if`/`for`/`try` driving assertions inside `it` blocks. Use `it.each` for parameterization.

### 7. Async test that doesn't `await`

```ts
// 🛑 if expectAssertion fires before the promise rejects, the test passes silently
it("rejects on invalid input", () => {
    expect(() => parse("bad")).rejects.toThrow();
});
```

```ts
// ✅ the test actually waits for the rejection before passing
it("rejects on invalid input", async () => {
    await expect(parse("bad")).rejects.toThrow();
});
```

**Why it's bad:** false greens. The test seems to pass but never observes the assertion's outcome.

**Rule:** any async assertion must be `await`ed. ESLint's `vitest/expect-expect` and `vitest/no-test-return-statement` rules catch this.

### 8. Sleeping in tests

```ts
// 🛑 slow, racy
await new Promise(r => setTimeout(r, 100));
expect(state).toBe("done");
```

```ts
// ✅ deterministic
vi.useFakeTimers();
// ... trigger code ...
vi.advanceTimersByTime(100);
expect(state).toBe("done");
vi.useRealTimers();
```

**Why it's bad:** real `setTimeout`s slow tests, and the chosen delay is always either too short (flaky) or too long (slow CI).

**Rule:** use fake timers. For UI assertions waiting on async render, use `findBy*` queries or `waitFor` — which polls and short-circuits the moment the assertion passes.

## RTL-specific anti-patterns (Kent C. Dodds)

### 9. Manual `cleanup()` when auto-registered

```ts
// 🛑 cleanup() is auto-registered when Vitest globals are on; calling it again is noise
afterEach(() => cleanup());
```

```ts
// ✅ trust the auto-registration; only call cleanup if you've disabled globals
// (no manual call needed)
```

**Why it's bad:** redundant; obscures the actual cleanup logic.

### 10. Wrapping `userEvent`/`render`/`fireEvent` in `act()`

```ts
// 🛑 RTL already wraps these — wrapping again silences real warnings
act(() => {
    fireEvent.click(button);
});
```

```ts
// ✅ just call them
await user.click(button);
```

**Why it's bad:** `act` warnings exist to surface state updates outside React's batching. Pre-emptively wrapping hides the warnings without fixing the underlying issue.

**Exception:** `renderHook` callbacks that update state directly *do* need `act` (state changes outside React events).

### 11. Destructuring queries from `render` instead of `screen`

```ts
// 🛑 less consistent, encourages reusing stale references
const { getByRole } = render(<App />);
expect(getByRole("button")).toBeInTheDocument();
```

```ts
// ✅ use screen for queries (always querying the live DOM)
render(<App />);
expect(screen.getByRole("button")).toBeInTheDocument();
```

**Why it's bad:** destructured queries can drift out of sync with the rendered tree across re-renders; `screen` is always live.

**Exception:** destructuring `rerender`, `unmount`, `container` from `render` is fine — those aren't queries.

### 12. `getByTestId` as first choice

```ts
// 🛑 couples test to a non-user-facing attribute
expect(screen.getByTestId("submit-btn")).toBeInTheDocument();
```

```ts
// ✅ query by what users see
expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
```

**Query priority (Testing Library):** `getByRole` > `getByLabelText` > `getByPlaceholderText` > `getByText` > `getByDisplayValue` > `getByAltText` > `getByTitle` > `getByTestId`.

**Rule:** `getByTestId` is the *last resort*, not the default.

### 13. Side effects inside `waitFor`

```ts
// 🛑 the click is retried on every poll — chaos
await waitFor(() => {
    user.click(button);
    expect(state).toBe("done");
});
```

```ts
// ✅ side effects outside, assertion inside
await user.click(button);
await waitFor(() => expect(state).toBe("done"));
// or even better, prefer findBy*:
expect(await screen.findByText(/done/i)).toBeInTheDocument();
```

**Why it's bad:** `waitFor` re-runs its callback on each tick; side effects compound.

### 14. Implementation testing

```ts
// 🛑 testing what the user can't see: state, classes, internal methods
expect(component.state.isOpen).toBe(true);
expect(container.firstChild).toHaveClass("button--primary");
expect(instance.handleClick).toHaveBeenCalled();
```

```ts
// ✅ testing what the user observes
expect(screen.getByRole("dialog")).toBeVisible();
expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
```

**Why it's bad:** tests fail on every refactor without finding real bugs (the "change-detector" smell).

**Rule:** assert on outputs the user (or caller) can observe — DOM, return values, mock invocations on boundaries — not on private state.

## Other smells worth naming

### 15. Mocking types you don't own

```ts
// 🛑 mocking a third-party SDK directly in every test
vi.mock("@stripe/stripe-js");
```

```ts
// ✅ wrap the SDK in your own thin adapter, mock the adapter
import { paymentClient } from "./paymentClient";  // your wrapper
vi.mock("./paymentClient");
```

**Why it's bad:** the SDK's surface changes; your tests rot. The adapter is the contract you control.

**Source:** Google TotT — "Don't Mock Types You Don't Own."

### 16. Snapshot as the only assertion

```ts
// 🛑 a 50-line snapshot that no one reads
expect(component).toMatchSnapshot();
```

```ts
// ✅ targeted assertions on the parts that matter
expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
```

**Why it's bad:** snapshots that nobody reviews drift to encode whatever the code happens to do. They flag *change*, not *correctness*.

**Rule:** use snapshots for stable, small, intentional shapes (e.g. an error code structure, a serialized JSON payload). Never as a substitute for real assertions on rendered components.

### 17. Skipped tests left in code

```ts
// 🛑 it.skip / xit / describe.skip rot fast — they get forgotten
it.skip("flaky on CI — fix later", () => { /* ... */ });
```

**Rule:** if a test is skipped, the reason and ticket should be in a comment, and the skip should be temporary. Better: delete it and re-write later.

### 18. Order-dependent tests

```ts
// 🛑 test 2 only passes if test 1 ran first
let user: User;
it("creates a user", () => {
    user = createUser({ name: "Ada" });
    expect(user.id).toBeDefined();
});
it("updates the user", () => {
    updateUser(user.id, { name: "Beth" });  // depends on test 1's `user`
    expect(user.name).toBe("Beth");
});
```

```ts
// ✅ each test sets up its own state
it("creates a user", () => { /* ... */ });
it("updates the user", () => {
    const user = createUser({ name: "Ada" });
    updateUser(user.id, { name: "Beth" });
    expect(/* ... */);
});
```

**Why it's bad:** they pass locally and fail on CI when test ordering shuffles. They also fail in `--shuffle` mode and `vitest --bail`.

## Quick checklist before declaring tests done

- [ ] No `toBeDefined()` / `toBeTruthy()` / `not.toBeNull()` where a precise assertion is possible
- [ ] No mocks of the unit under test
- [ ] No assertions that lock current (possibly buggy) behavior — surface bugs, don't paper them over
- [ ] No `if`/`for`/`try` driving assertions inside `it`
- [ ] All async assertions are `await`ed
- [ ] No real `setTimeout` waits (fake timers or `findBy*`/`waitFor` instead)
- [ ] No `it.skip` / `xit` left without a tracking comment
- [ ] No order dependence between tests
- [ ] No `getByTestId` where a role/label query works
- [ ] Snapshots, if used, are small and targeted
- [ ] Mocks live at boundaries (network, fs, SDKs you don't own), not at the unit
- [ ] No assertions on private state, internal methods, or class names
