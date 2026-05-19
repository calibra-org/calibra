import { describe, expect, it, vi } from "vitest";

import { BackendError } from "./BackendError";
import { HttpClient } from "./HttpClient";

function mockFetch(response: { body?: unknown; status?: number }) {
    const status = response.status ?? 200;
    const text = typeof response.body === "string" ? response.body : JSON.stringify(response.body ?? {});
    return vi.fn<typeof fetch>(async () => new Response(text, { status, statusText: status === 200 ? "OK" : "Error" }));
}

describe("HttpClient", () => {
    it("drops null / undefined / empty header values", async () => {
        const fetchImpl = mockFetch({ body: { ok: true } });
        const client = new HttpClient({
            baseUrl: "https://api.test",
            headers: { keep: "yes", drop1: null, drop2: undefined, drop3: "" },
            fetch: fetchImpl as unknown as typeof fetch,
        });
        await client.get("/ping");
        const init = fetchImpl.mock.calls[0]?.[1];
        expect(init?.headers).toEqual({ keep: "yes" });
    });

    it("drops null / undefined query params instead of serializing them", async () => {
        const fetchImpl = mockFetch({ body: { ok: true } });
        const client = new HttpClient({
            baseUrl: "https://api.test",
            fetch: fetchImpl as unknown as typeof fetch,
        });
        await client.get("/products", { query: { page: 1, search: undefined, brand: null, sort: "newest" } });
        const url = fetchImpl.mock.calls[0]?.[0] as string;
        expect(url).toBe("https://api.test/products?page=1&sort=newest");
    });

    it("wraps non-2xx responses in BackendError with the body parsed", async () => {
        const fetchImpl = mockFetch({ status: 422, body: { message: "Validation failed", errors: [] } });
        const client = new HttpClient({
            baseUrl: "https://api.test",
            fetch: fetchImpl as unknown as typeof fetch,
        });
        await expect(client.get("/products")).rejects.toMatchObject({
            name: "BackendError",
            status: 422,
            message: "Validation failed",
            body: { message: "Validation failed", errors: [] },
        });
    });

    it("wraps network failures in BackendError(status=0)", async () => {
        const fetchImpl = vi.fn(async () => {
            throw new TypeError("fetch failed");
        });
        const client = new HttpClient({
            baseUrl: "https://api.test",
            fetch: fetchImpl as unknown as typeof fetch,
        });
        await expect(client.get("/products")).rejects.toMatchObject({
            name: "BackendError",
            status: 0,
            message: "fetch failed",
        });
    });

    it("BackendError extractMessage falls back through message → error → statusText", () => {
        expect(new BackendError(500, null, "Server Error").message).toBe("Server Error");
        expect(new BackendError(500, { error: "boom" }).message).toBe("boom");
        expect(new BackendError(500, { message: "first", error: "second" }).message).toBe("first");
        expect(new BackendError(500, "not an object").message).toBe("Request failed");
    });
});
