import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import { TENANT_HEADER } from "#/lib/tenant/constants";

const SESSION_COOKIE = "calibra_content_session";
const SESSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
    const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
    const tenant = requestHeaders.get(TENANT_HEADER);
    const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3333").replace(/\/$/, "");
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > 16_384) {
        return NextResponse.json(
            { errors: [{ message: "Request body is too large", code: "E_REQUEST_TOO_LARGE" }] },
            { status: 413 },
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(rawBody);
    } catch {
        return NextResponse.json(
            { errors: [{ message: "Request body must be valid JSON", code: "E_VALIDATION_ERROR" }] },
            { status: 400 },
        );
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json(
            { errors: [{ message: "Request body must be an object", code: "E_VALIDATION_ERROR" }] },
            { status: 400 },
        );
    }

    const currentSession = cookieStore.get(SESSION_COOKIE)?.value;
    const sessionKey = currentSession && SESSION_PATTERN.test(currentSession) ? currentSession : randomUUID();
    const body = JSON.stringify({ ...(parsed as Record<string, unknown>), session_key: sessionKey });
    const upstream = await fetch(`${base}/api/v1/content/events`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json",
            ...(tenant ? { [TENANT_HEADER]: tenant } : {}),
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
    });
    const response = new NextResponse(upstream.body, {
        status: upstream.status,
        headers: {
            "content-type": upstream.headers.get("content-type") || "application/json",
            "cache-control": "no-store",
        },
    });
    if (sessionKey !== currentSession) {
        response.cookies.set(SESSION_COOKIE, sessionKey, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 60 * 60 * 24 * 30,
        });
    }
    return response;
}
