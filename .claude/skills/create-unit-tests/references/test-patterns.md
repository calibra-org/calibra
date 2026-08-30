# Vitest Test Patterns

Copy-pasteable patterns for the most common kinds of unit tests. Adapt names, imports, and conventions to match the surrounding codebase — these are starting points, not law.

## Table of contents

1. [Pure utilities](#1-pure-utilities)
2. [Async functions and promises](#2-async-functions-and-promises)
3. [Error handling](#3-error-handling)
4. [Module mocking with `vi.mock`](#4-module-mocking-with-vimock)
5. [Spying and partial mocks](#5-spying-and-partial-mocks)
6. [Fake timers (time-sensitive code)](#6-fake-timers-time-sensitive-code)
7. [Mocking randomness](#7-mocking-randomness)
8. [HTTP and network mocking](#8-http-and-network-mocking)
9. [React hooks via `renderHook`](#9-react-hooks-via-renderhook)
10. [React components via Testing Library](#10-react-components-via-testing-library)
11. [Custom render with providers](#11-custom-render-with-providers)
12. [Fixtures and factories](#12-fixtures-and-factories)
13. [Type-safety assertions](#13-type-safety-assertions)
14. [Parameterized tests with `it.each`](#14-parameterized-tests-with-iteach)
15. [Environment variable stubbing](#15-environment-variable-stubbing)
16. [Snapshot testing (use sparingly)](#16-snapshot-testing-use-sparingly)
17. [Test isolation and cleanup](#17-test-isolation-and-cleanup)

---

## 1. Pure utilities

Pure functions (deterministic, no side effects) are the easiest to test. Cover happy path, edge cases, and any thrown errors.

```ts
// formatBytes.ts
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) {
        throw new RangeError("bytes must be a finite, non-negative number");
    }
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}
```

```ts
// formatBytes.test.ts
import { describe, expect, it } from "vitest";

import { formatBytes } from "./formatBytes";

describe("formatBytes", () => {
    it("returns '0 B' for zero", () => {
        expect(formatBytes(0)).toBe("0 B");
    });

    it("formats bytes under 1 KB", () => {
        expect(formatBytes(512)).toBe("512.0 B");
    });

    it("formats kilobytes", () => {
        expect(formatBytes(1536)).toBe("1.5 KB");
    });

    it("clamps to TB for very large values", () => {
        expect(formatBytes(1024 ** 5)).toBe("1024.0 TB");
    });

    it("throws RangeError for negative input", () => {
        expect(() => formatBytes(-1)).toThrow(RangeError);
    });

    it("throws RangeError for NaN", () => {
        expect(() => formatBytes(Number.NaN)).toThrow(/finite/);
    });

    it("throws RangeError for Infinity", () => {
        expect(() => formatBytes(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    });
});
```

## 2. Async functions and promises

Use `async`/`await` in tests. Always assert both resolved and rejected paths.

```ts
import { describe, expect, it } from "vitest";

import { fetchUser } from "./fetchUser";

describe("fetchUser", () => {
    it("resolves with the user when the call succeeds", async () => {
        const user = await fetchUser("u_123");
        expect(user).toEqual({ id: "u_123", name: "Ada" });
    });

    it("rejects with NotFoundError when the user is missing", async () => {
        await expect(fetchUser("missing")).rejects.toThrow("User not found");
    });

    it("rejects with the original error if the network fails", async () => {
        await expect(fetchUser("net-fail")).rejects.toMatchObject({
            name: "NetworkError",
        });
    });
});
```

For long-running async code, prefer asserting on the rejection/resolution itself rather than wrapping in try/catch — `await expect(...).rejects` is clearer and won't silently pass if the promise resolves.

## 3. Error handling

Test the *type* and *shape* of errors, not just that something threw. **Prefer matcher forms** (`toThrowError`/`rejects.toThrowError` with `expect.objectContaining`) — they read clearly and don't risk leaving the assertion unreached if the call accidentally doesn't throw.

```ts
import { describe, expect, it } from "vitest";

import { ValidationError, parseConfig } from "./parseConfig";

describe("parseConfig", () => {
    // ✅ preferred: matcher form
    it("throws ValidationError with the offending field", () => {
        expect(() => parseConfig({ port: "not-a-number" })).toThrowError(
            expect.objectContaining({ name: "ValidationError", field: "port" }),
        );
    });

    // For async code:
    it("rejects with NotFoundError for a missing user", async () => {
        await expect(getUser("missing")).rejects.toThrowError(
            expect.objectContaining({ name: "NotFoundError", code: "USER_MISSING" }),
        );
    });

    // try/catch fallback only when you need to inspect a property the matchers can't express.
    // Use `expect.unreachable("...")` (NOT the undocumented `expect.fail`) to assert the call must throw.
    it("preserves the cause chain across rethrows", () => {
        try {
            parseConfig({ port: "x" });
            expect.unreachable("expected parseConfig to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
            expect((err as ValidationError).cause).toBeInstanceOf(TypeError);
        }
    });
});
```

Don't rely on substring matches when a structured assertion is possible — error messages are easy to refactor and brittle tests rot.

## 4. Module mocking with `vi.mock`

Mock at the module boundary when a module pulls in something heavy or non-deterministic.

```ts
import { describe, expect, it, vi } from "vitest";

// Hoisted: vi.mock calls are hoisted above imports.
vi.mock("./logger", () => ({
    log: vi.fn(),
    error: vi.fn(),
}));

import { handleRequest } from "./handleRequest";
import * as logger from "./logger";

describe("handleRequest", () => {
    it("logs the incoming request", () => {
        handleRequest({ url: "/api/x" });
        expect(logger.log).toHaveBeenCalledWith("incoming", { url: "/api/x" });
    });
});
```

For partial mocks (keep the real module but override one export), use the modern `importOriginal` parameter form — type-safer than the older `vi.importActual` because the path string appears once:

```ts
vi.mock("./math", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./math")>();
    return {
        ...actual,
        randomInt: vi.fn(() => 42),
    };
});
```

For typed access to mocked exports, use `vi.mocked()` — preserves types and avoids `as unknown as Mock` casts:

```ts
import { vi } from "vitest";
import * as logger from "./logger";

vi.mock("./logger");

const mockLog = vi.mocked(logger.log);
mockLog.mockReturnValue(undefined);
expect(mockLog).toHaveBeenCalledWith("incoming", { url: "/api/x" });
```

When you need shared mocks accessible from both the hoisted `vi.mock` factory and the test body, use `vi.hoisted()`. Top-level `const`s are *not* hoisted, so referencing them inside a `vi.mock` factory throws `ReferenceError: Cannot access ... before initialization`:

```ts
const { mockSendEvent } = vi.hoisted(() => ({ mockSendEvent: vi.fn() }));

vi.mock("./analytics", () => ({ sendEvent: mockSendEvent }));

it("emits an analytics event", () => {
    doSomething();
    expect(mockSendEvent).toHaveBeenCalledWith("user_action", { id: 1 });
});
```

## 5. Spying and partial mocks

For one-off overrides without re-mocking the whole module:

```ts
import { describe, expect, it, vi } from "vitest";

import * as clock from "./clock";
import { stamp } from "./stamp";

describe("stamp", () => {
    it("uses the current time from clock.now", () => {
        const spy = vi.spyOn(clock, "now").mockReturnValue(1_700_000_000_000);
        expect(stamp("hello")).toBe("1700000000000:hello");
        spy.mockRestore();
    });
});
```

`mockRestore` (or a global `vi.restoreAllMocks()` in `afterEach`) is essential — leaked spies cause baffling failures in unrelated tests.

## 6. Fake timers (time-sensitive code)

Anything reading `Date.now`, using `setTimeout`/`setInterval`, or running debounce/throttle/poll loops needs fake timers.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { debounce } from "./debounce";

describe("debounce", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("invokes the callback once after the delay", () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced("a");
        debounced("b");
        debounced("c");

        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith("c");
    });

    it("resets the timer when called again before the delay elapses", () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced("a");
        vi.advanceTimersByTime(50);
        debounced("b");
        vi.advanceTimersByTime(50);

        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(50);
        expect(fn).toHaveBeenCalledOnce();
    });
});
```

For code that awaits inside intervals, use `vi.advanceTimersByTimeAsync` — the sync version doesn't drain microtasks. For chained promises + timers, prefer `vi.runAllTimersAsync()` (drains everything) or `vi.runOnlyPendingTimersAsync()` (avoids infinite-loop risk for self-rescheduling timers).

> **Critical: fake timers + `userEvent`.** When `vi.useFakeTimers()` is active, `userEvent.click`/`type`/etc. **will hang indefinitely** unless you tell userEvent how to advance timers. Always pass `advanceTimers`:
>
> ```tsx
> beforeEach(() => vi.useFakeTimers());
> afterEach(() => vi.useRealTimers());
>
> it("debounces input", async () => {
>     const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
>     render(<DebouncedSearch />);
>     await user.type(screen.getByRole("searchbox"), "hello");
>     vi.advanceTimersByTime(300);
>     expect(screen.getByRole("status")).toHaveTextContent("hello");
> });
> ```
>
> This is the single most common gotcha when combining RTL + fake timers; missing it produces a hung test with no error message.

## 7. Mocking randomness

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { generateId } from "./generateId";

describe("generateId", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("uses Math.random to produce a deterministic id when seeded", () => {
        vi.spyOn(Math, "random").mockReturnValue(0.5);
        expect(generateId()).toBe("id_8000");
    });

    it("falls back to crypto.randomUUID when available", () => {
        vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
            "00000000-0000-4000-8000-000000000000" as `${string}-${string}-${string}-${string}-${string}`,
        );
        expect(generateId({ format: "uuid" })).toBe("00000000-0000-4000-8000-000000000000");
    });
});
```

## 8. HTTP and network mocking

**Prefer MSW (Mock Service Worker) for any non-trivial fetch surface.** It mocks at the network layer (request URL + method), works across `fetch`/`axios`/SDK clients, survives implementation refactors, and is the official recommendation in both the Vitest mocking guide and the MSW Node integration. Reuse the project's existing setup if one exists (typically `tests/helpers/server.ts` with a shared `setupServer(...handlers)`).

```ts
// tests/helpers/server.ts
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

export const server = setupServer(
    http.get("/api/users/:id", ({ params }) => {
        return HttpResponse.json({ id: params.id, name: "Ada" });
    }),
);
```

```ts
// some.test.ts
import { server } from "./helpers/server";
import { http, HttpResponse } from "msw";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it("returns 404 for missing users", async () => {
    server.use(http.get("/api/users/:id", () => HttpResponse.text("not found", { status: 404 })));
    await expect(getUser("missing")).rejects.toThrow(/404/);
});
```

For ad-hoc fetches in single-purpose tests, spy on `globalThis.fetch`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { getUser } from "./getUser";

describe("getUser", () => {
    afterEach(() => vi.restoreAllMocks());

    it("returns the user from the response body", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify({ id: "u_1", name: "Ada" }), {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
        );

        await expect(getUser("u_1")).resolves.toEqual({ id: "u_1", name: "Ada" });
    });

    it("throws on non-2xx responses", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response("not found", { status: 404 }),
        );

        await expect(getUser("missing")).rejects.toThrow(/404/);
    });
});
```

`vi.spyOn` keeps the original `fetch` reference (clean restore via `restoreAllMocks`). When `fetch` may not exist on `globalThis` (older Node, polyfilled environments), use `vi.stubGlobal("fetch", vi.fn())` instead — and ensure cleanup via `vi.unstubAllGlobals()` in `afterEach` or the `unstubGlobals: true` config option.

> **Environment note:** the global `Response` constructor used to build mock responses is available in jsdom and Node 18+. If your tests must run on an older Node, polyfill via `undici` or use `whatwg-fetch`.

## 9. React hooks via `renderHook`

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useCounter } from "./useCounter";

describe("useCounter", () => {
    it("starts at the initial value", () => {
        const { result } = renderHook(() => useCounter(5));
        expect(result.current.count).toBe(5);
    });

    it("increments when increment is called", () => {
        const { result } = renderHook(() => useCounter(0));

        act(() => {
            result.current.increment();
        });

        expect(result.current.count).toBe(1);
    });

    it("respects the optional step argument", () => {
        const { result } = renderHook(() => useCounter(0, { step: 5 }));

        act(() => {
            result.current.increment();
            result.current.increment();
        });

        expect(result.current.count).toBe(10);
    });

    it("re-runs when initial value changes via rerender", () => {
        const { result, rerender } = renderHook(({ initial }: { initial: number }) => useCounter(initial), {
            initialProps: { initial: 0 },
        });

        rerender({ initial: 100 });
        // Hooks don't auto-reset on prop change — confirm behavior matches intent.
        expect(result.current.count).toBe(0);
    });
});
```

For hooks needing context, pass a `wrapper` — but if multiple tests need the same providers, factor a custom render utility (Section 11).

```tsx
const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider value="dark">{children}</ThemeProvider>
);

const { result } = renderHook(() => useTheme(), { wrapper });
```

> **`act()` and `renderHook`**: state updates triggered directly from a hook's exposed methods (`result.current.increment()`) happen *outside* React's synthetic event system, so RTL doesn't wrap them automatically — you must wrap them in `act(() => { ... })`. **Don't** wrap `userEvent`, `render`, or `fireEvent` in `act()` — RTL already wraps those, and double-wrapping silences real warnings.

## 10. React components via Testing Library

**Query priority** (Testing Library official):
1. `getByRole` (with `name`) — what assistive tech sees
2. `getByLabelText` — form fields with associated labels
3. `getByPlaceholderText` — last-resort form input
4. `getByText` — non-interactive text
5. `getByDisplayValue` — current value of a form input
6. `getByAltText` — `<img alt>`
7. `getByTitle` — `title` attribute
8. **`getByTestId` — last resort only**, when nothing else identifies the element semantically. Treat it as an escape hatch, not the default.

Avoid `querySelector` and class-based selectors — they couple tests to implementation. Always prefer `screen.*` over destructuring queries from `render` — `screen` is always live against the current DOM, while destructured queries can drift out of sync across re-renders.

For async UI (data loaded after render), use `findBy*` (returns a promise that retries until the element exists or times out):

```tsx
// Instead of: await waitFor(() => expect(screen.getByText(/loaded/i)).toBeInTheDocument());
expect(await screen.findByText(/loaded/i)).toBeInTheDocument();
```

For non-DOM async assertions (state, mock invocations), use `waitFor` — but never put side effects inside the callback. The callback is retried on every poll; side effects compound:

```tsx
await user.click(screen.getByRole("button", { name: /save/i }));
await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
```

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Counter } from "./Counter";

describe("<Counter />", () => {
    it("renders the initial count", () => {
        render(<Counter initial={3} />);
        expect(screen.getByRole("status", { name: /count/i })).toHaveTextContent("3");
    });

    it("increments when the user clicks the increment button", async () => {
        const user = userEvent.setup();
        render(<Counter initial={0} />);

        await user.click(screen.getByRole("button", { name: /increment/i }));

        expect(screen.getByRole("status", { name: /count/i })).toHaveTextContent("1");
    });

    it("calls onChange with the new value", async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();

        render(<Counter initial={0} onChange={onChange} />);
        await user.click(screen.getByRole("button", { name: /increment/i }));

        expect(onChange).toHaveBeenCalledWith(1);
    });

    it("disables the decrement button at zero", () => {
        render(<Counter initial={0} />);
        expect(screen.getByRole("button", { name: /decrement/i })).toBeDisabled();
    });
});
```

`userEvent.setup()` (per-test) is the modern API — it creates a user with realistic event sequencing. Don't use the deprecated module-level `userEvent.click()` form.

## 11. Custom render with providers

Most real-world component tests need providers (theme, query client, router, i18n, auth). Factor a `renderWithProviders` once and re-export the rest of `@testing-library/react` from a `test-utils.tsx`:

```tsx
// test-utils.tsx
import { type ReactElement, type ReactNode } from "react";
import { type RenderOptions, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface ProvidersProps {
    children: ReactNode;
}

export function makeQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    });
}

function AllProviders({ children }: ProvidersProps) {
    return <QueryClientProvider client={makeQueryClient()}>{children}</QueryClientProvider>;
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
    return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything from RTL so tests import a single module.
export * from "@testing-library/react";
export { renderWithProviders as render };
```

```tsx
// MyComponent.test.tsx
import { render, screen } from "../test-utils";

test("renders within providers", () => {
    render(<MyComponent />);
    expect(screen.getByRole("heading", { name: /title/i })).toBeInTheDocument();
});
```

This is the canonical Testing Library pattern (see https://testing-library.com/docs/react-testing-library/setup) and is used in TanStack Query, shadcn/ui, and most production React + Vitest codebases.

## 12. Fixtures and factories

For complex inputs, factor a factory function so each test can override only what matters:

```ts
// fixtures.ts
import type { Order } from "./types";

export function makeOrder(overrides: Partial<Order> = {}): Order {
    return {
        id: "ord_default",
        amount: 100,
        currency: "USD",
        status: "pending",
        createdAt: new Date("2025-01-01T00:00:00Z"),
        ...overrides,
    };
}
```

```ts
// validateOrder.test.ts
import { describe, expect, it } from "vitest";

import { makeOrder } from "./fixtures";
import { validateOrder } from "./validateOrder";

describe("validateOrder", () => {
    it("accepts a valid pending order", () => {
        expect(validateOrder(makeOrder())).toEqual({ ok: true });
    });

    it("rejects orders with negative amounts", () => {
        expect(validateOrder(makeOrder({ amount: -10 }))).toEqual({
            ok: false,
            reason: "amount-must-be-positive",
        });
    });
});
```

This pattern keeps the *intent* of each test visible — `makeOrder({ amount: -10 })` reads as "the negative-amount case" without burying it in 10 lines of setup.

For shared, typed setup that needs cleanup, use Vitest's `test.extend` (the test-context API) instead of ad-hoc `beforeEach` chains:

```ts
import { test as base } from "vitest";
import { makeOrder } from "./fixtures";
import type { Order } from "./types";

interface Fixtures {
    order: Order;
}

const test = base.extend<Fixtures>({
    order: async ({}, use) => {
        const order = makeOrder();
        await use(order);
        // cleanup runs here after the test
    },
});

test("validates a valid order", ({ order }) => {
    expect(validateOrder(order)).toEqual({ ok: true });
});
```

`test.extend` gives you fixtures with explicit setup/teardown that compose across test files — better than module-level state when multiple tests share an expensive resource.

## 13. Type-safety assertions

For TypeScript projects, you can assert types compile (or fail to compile) using `expectTypeOf` from Vitest:

```ts
import { describe, expectTypeOf, it } from "vitest";

import { formatId } from "./formatId";

describe("formatId types", () => {
    it("returns a string", () => {
        expectTypeOf(formatId("abc")).toEqualTypeOf<string>();
    });

    it("rejects non-string input at the type level", () => {
        // @ts-expect-error: formatId requires a string
        formatId(123);
    });
});
```

Use sparingly — type tests catch real regressions but add noise if overused.

## 14. Parameterized tests with `it.each`

When you have a table of inputs/outputs, `it.each` is cleaner than ten near-identical `it` blocks:

```ts
import { describe, expect, it } from "vitest";

import { slugify } from "./slugify";

describe("slugify", () => {
    it.each([
        ["Hello World", "hello-world"],
        ["  spaced out  ", "spaced-out"],
        ["UPPER", "upper"],
        ["with-dashes-already", "with-dashes-already"],
        ["non/ascii ÆÆÆ", "non-ascii"],
        ["", ""],
    ])("slugifies %j -> %j", (input, expected) => {
        expect(slugify(input)).toBe(expected);
    });
});
```

## 15. Environment variable stubbing

Tests that read `process.env.X` or `import.meta.env.X` directly are flake-prone — they pass on your machine and break on CI. Use `vi.stubEnv` for both Node and Vite environments:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

describe("config", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("uses staging URL when API_ENV is staging", () => {
        vi.stubEnv("API_ENV", "staging");
        expect(getApiUrl()).toBe("https://api-staging.example.com");
    });

    it("uses production URL by default", () => {
        // No stub — uses whatever was originally set
        expect(getApiUrl()).toBe("https://api.example.com");
    });
});
```

For one-off pinning of `TZ` (timezone determinism — critical for date-formatting tests), the same applies: `vi.stubEnv("TZ", "UTC")`. Set `unstubEnvs: true` in `vitest.config.ts` if you want auto-restore between every test instead of remembering `vi.unstubAllEnvs()`.

## 16. Snapshot testing (use sparingly)

Snapshots are useful for stable, intentional shapes — error code structures, serialized JSON payloads, normalized data. They are **not** a substitute for real assertions on rendered components. Inline snapshots are easier to review than file snapshots:

```ts
it("normalizes the user payload", () => {
    const result = normalizeUser({ user_id: "1", display_name: "Ada", email_addr: "a@b.co" });
    expect(result).toMatchInlineSnapshot(`
        {
          "email": "a@b.co",
          "id": "1",
          "name": "Ada",
        }
    `);
});
```

> **Warning:** an unreviewed snapshot encodes whatever the code happens to do — including bugs. If `normalizeUser` is wrong and you `--update-snapshots`, you've cemented the bug into the test. Treat snapshot diffs as a real review, not noise to suppress. Don't use snapshots as the *only* assertion for component rendering — pair them with concrete `getByRole`/`toHaveTextContent` checks.

## 17. Test isolation and cleanup

A robust suite cleans up after itself — even when individual tests don't strictly need it. Modern Vitest + RTL setups auto-register `cleanup()` when globals are enabled and a global `afterEach` exists, so a manual `cleanup()` call is usually unnecessary noise — confirm by reading the project's `setupFiles` before adding one.

```ts
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
    // Reset any module-level state your code under test might mutate.
    // For modules with their own state (singletons, caches), call vi.resetModules().
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});
```

Place these at the top of the file (or in a shared setup) so isolation is consistent and visible.

> **Vitest 4 caveat:** `vi.restoreAllMocks()` no longer restores automocks (only manual `vi.spyOn` mocks). If the project is on Vitest 4 and you've used `vi.mock` for module automocking, you'll need explicit `vi.unmock()` or `vi.doUnmock()` per their migration guide. Check the project's installed Vitest version (`pnpm list vitest`).

---

## When to skip a pattern

Patterns are starting points, not requirements. Skip:
- Fake timers when no time-related code runs
- Module mocks when the module is already pure and cheap
- `renderHook` for hooks with no side effects (test the underlying function instead, if exported)
- `userEvent` when a component has no interaction surface (a presentational component just needs `render` + assertions on output)

Use judgment. Match the test's complexity to the code's complexity.
