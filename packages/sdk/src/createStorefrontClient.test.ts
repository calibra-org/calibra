import { describe, expect, it, vi } from "vitest";

import { createStorefrontClient } from "./createStorefrontClient";

function mockFetch(status: number, body: unknown) {
    return vi.fn<typeof fetch>(async () =>
        Promise.resolve(new Response(JSON.stringify(body), { status, statusText: status === 200 ? "OK" : "Error" })),
    );
}

describe("createStorefrontClient", () => {
    it("returns typed data on a 2xx response", async () => {
        const fetchImpl = mockFetch(200, {
            user: { id: 1 },
            customer: null,
            token: "t-abc",
        });
        const client = createStorefrontClient({
            origin: "https://api.test",
            fetch: fetchImpl as unknown as typeof fetch,
        });
        const { data, error } = await client.POST("/api/v1/auth/login", {
            body: { email: "a@b.io", password: "Password123" },
        });
        expect(error).toBeUndefined();
        expect(data?.token).toBe("t-abc");
    });

    it("throws BackendError on a non-2xx response", async () => {
        const fetchImpl = mockFetch(422, { message: "Invalid", errors: [] });
        const client = createStorefrontClient({
            origin: "https://api.test",
            fetch: fetchImpl as unknown as typeof fetch,
        });
        await expect(client.POST("/api/v1/auth/login", { body: { email: "a@b.io", password: "x" } })).rejects.toMatchObject({
            name: "BackendError",
            status: 422,
            message: "Invalid",
        });
    });

    it("forwards locale and bearer token as sanitized headers", async () => {
        const fetchImpl = mockFetch(200, { user: { id: 1 }, customer: null, token: "t" });
        const client = createStorefrontClient({
            origin: "https://api.test",
            locale: "fa",
            token: "abc",
            fetch: fetchImpl as unknown as typeof fetch,
        });
        await client.POST("/api/v1/auth/login", { body: { email: "a@b.io", password: "x" } });
        const request = fetchImpl.mock.calls[0]?.[0] as unknown as Request;
        expect(request.headers.get("accept-language")).toBe("fa");
        expect(request.headers.get("authorization")).toBe("Bearer abc");
    });

    it("drops null / undefined header values from createStorefrontClient", async () => {
        const fetchImpl = mockFetch(200, { user: { id: 1 }, customer: null, token: "t" });
        const client = createStorefrontClient({
            origin: "https://api.test",
            token: undefined,
            headers: { "x-extra": null, "x-keep": "yes" },
            fetch: fetchImpl as unknown as typeof fetch,
        });
        await client.POST("/api/v1/auth/login", { body: { email: "a@b.io", password: "x" } });
        const request = fetchImpl.mock.calls[0]?.[0] as unknown as Request;
        expect(request.headers.get("authorization")).toBeNull();
        expect(request.headers.get("x-extra")).toBeNull();
        expect(request.headers.get("x-keep")).toBe("yes");
    });
});
