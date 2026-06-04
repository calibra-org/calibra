"use client";

/** Mirror of `auth.ts`'s `CSRF_COOKIE` — duplicated here because `auth.ts` is server-only. */
const CSRF_COOKIE = "platform_csrf";

/** A failed control-plane proxy response. `body` is the parsed JSON error envelope when present. */
export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly body: unknown,
    ) {
        super(`Control-plane request failed (${status})`);
        this.name = "ApiError";
    }
}

function readCsrf(): string {
    const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
}

async function parse(res: Response): Promise<unknown> {
    const text = await res.text();
    if (text.length === 0) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/** GET a control-plane resource through the same-origin proxy. Returns the raw envelope. */
export async function platformGet<T>(path: string): Promise<T> {
    const res = await fetch(`/api/platform/${path}`, { headers: { accept: "application/json" } });
    const body = await parse(res);
    if (!res.ok) throw new ApiError(res.status, body);
    return body as T;
}

/** Send a mutating control-plane request (POST/PATCH/DELETE) with the double-submit CSRF header. */
export async function platformSend<T>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
    const res = await fetch(`/api/platform/${path}`, {
        method,
        headers: { accept: "application/json", "content-type": "application/json", "x-csrf-token": readCsrf() },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = await parse(res);
    if (!res.ok) throw new ApiError(res.status, parsed);
    return parsed as T;
}
