/**
 * Test-only `globalThis.fetch` mock. Per-URL responses are registered up front; an unregistered URL
 * raises so a forgotten mock isn't silently swallowed by a real network call. Pair with `mockFetch`
 * at group setup and `unmockFetch` at group teardown.
 */

type ResponseSpec = {
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
};

type Routes = Record<string, ResponseSpec | ResponseSpec[]>;

type MaybeRequest = { url: string };

const originalFetch = globalThis.fetch;
let active = false;
let routes: Routes = {};
const calls: Array<{ url: string; init?: RequestInit }> = [];
const cursors: Record<string, number> = {};

export interface MockFetchCall {
    url: string;
    method: string;
    body: unknown;
    headers: Record<string, string>;
}

/**
 * Install or update the per-URL response map. Calling `mockFetch` again merges new routes into the
 * existing set — useful for tests that want to add a verify-step mock after the init mock has
 * already fired.
 */
export function mockFetch(map: Routes = {}): void {
    if (!active) {
        active = true;
        calls.length = 0;
        routes = {};
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (globalThis as any).fetch = mockedFetch;
    }
    for (const [url, spec] of Object.entries(map)) {
        routes[url] = spec;
    }
}

export function unmockFetch(): void {
    active = false;
    routes = {};
    calls.length = 0;
    Object.keys(cursors).forEach((k) => delete cursors[k]);
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (globalThis as any).fetch = originalFetch;
}

/** All fetch calls captured since install, in order. */
export function fetchCalls(): MockFetchCall[] {
    return calls.map((c) => ({
        url: c.url,
        method: ((c.init?.method as string) ?? "GET").toUpperCase(),
        body: parseBody(c.init?.body),
        headers: extractHeaders(c.init?.headers),
    }));
}

async function mockedFetch(input: string | URL | MaybeRequest, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as MaybeRequest).url;
    calls.push({ url, init });
    const route = routes[url];
    if (!route) {
        throw new Error(`mockFetch: no route registered for ${url}`);
    }
    const spec = Array.isArray(route) ? route[Math.min((cursors[url] ?? 0), route.length - 1)] : route;
    if (Array.isArray(route)) cursors[url] = (cursors[url] ?? 0) + 1;
    const body = spec.body === undefined ? "" : JSON.stringify(spec.body);
    return new Response(body, {
        status: spec.status ?? 200,
        headers: { "Content-Type": "application/json", ...(spec.headers ?? {}) },
    });
}

function parseBody(raw: unknown): unknown {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === "string") {
        try {
            return JSON.parse(raw);
        } catch {
            return raw;
        }
    }
    return raw;
}

function extractHeaders(raw: unknown): Record<string, string> {
    if (!raw) return {};
    if (typeof Headers !== "undefined" && raw instanceof Headers) {
        const out: Record<string, string> = {};
        raw.forEach((v, k) => {
            out[k] = v;
        });
        return out;
    }
    if (Array.isArray(raw)) return Object.fromEntries(raw as Array<[string, string]>);
    return { ...(raw as Record<string, string>) };
}
