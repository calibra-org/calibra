import { beforeEach, describe, expect, it, vi } from "vitest";

interface ClientOptions {
    locale?: string;
    headers?: Record<string, string>;
}

const h = vi.hoisted(() => ({
    createApiClient: vi.fn((_options?: { locale?: string; headers?: Record<string, string> }) => ({}) as never),
    headerStore: new Map<string, string>(),
    cookieStore: new Map<string, { value: string }>(),
    state: { locale: "fa" },
}));

vi.mock("server-only", () => ({}));
vi.mock("@calibra/sdk", () => ({ createApiClient: h.createApiClient }));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve(h.state.locale) }));
vi.mock("next/headers", () => ({
    headers: () => Promise.resolve({ get: (k: string) => h.headerStore.get(k.toLowerCase()) ?? null }),
    cookies: () => Promise.resolve({ get: (k: string) => h.cookieStore.get(k) }),
}));

import { apiServer } from "./api";

describe("apiServer", () => {
    beforeEach(() => {
        h.createApiClient.mockClear();
        h.headerStore.clear();
        h.cookieStore.clear();
        h.state.locale = "fa";
    });

    it("forwards both the locale (→ Accept-Language) and the resolved tenant header", async () => {
        h.headerStore.set("x-calibra-tenant", "aurora");
        await apiServer();

        const options = h.createApiClient.mock.calls[0]?.[0] as ClientOptions;
        expect(options.locale).toBe("fa");
        expect(options.headers?.["x-calibra-tenant"]).toBe("aurora");
    });

    it("forwards the cart_token cookie alongside the tenant header", async () => {
        h.headerStore.set("x-calibra-tenant", "mehr");
        h.cookieStore.set("cart_token", { value: "abc123" });
        await apiServer();

        const options = h.createApiClient.mock.calls[0]?.[0] as ClientOptions;
        expect(options.headers?.["x-calibra-tenant"]).toBe("mehr");
        expect(options.headers?.cookie).toBe("cart_token=abc123");
    });

    it("omits the tenant header on a platform request (no tenant resolved)", async () => {
        await apiServer();
        const options = h.createApiClient.mock.calls[0]?.[0] as ClientOptions;
        expect(options.headers?.["x-calibra-tenant"]).toBeUndefined();
    });
});
