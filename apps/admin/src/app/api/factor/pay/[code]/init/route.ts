import type { NextRequest } from "next/server";

import { TENANT_HEADER } from "#/lib/tenant/constants";
import { resolveHost, tenantRefFor } from "#/lib/tenant/resolve-host";

interface RouteContext {
    params: Promise<{ code: string }>;
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
    const { code } = await context.params;
    const base = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!base) return Response.json({ error: "api_base_url_missing" }, { status: 500 });
    const tenant = tenantRefFor(resolveHost(request.headers.get("host")));
    if (!tenant) return Response.json({ error: "tenant_missing" }, { status: 404 });
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey) {
        return Response.json({ error: "idempotency_key_required" }, { status: 422, headers: { "cache-control": "no-store" } });
    }
    const maxBodyBytes = 16 * 1024;
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
        return Response.json({ error: "payload_too_large" }, { status: 413, headers: { "cache-control": "no-store" } });
    }
    const body = await request.arrayBuffer();
    if (body.byteLength > maxBodyBytes) {
        return Response.json({ error: "payload_too_large" }, { status: 413, headers: { "cache-control": "no-store" } });
    }
    try {
        const upstream = await fetch(`${base.replace(/\/+$/, "")}/api/v1/factor/pay/${encodeURIComponent(code)}/init`, {
            method: "POST",
            headers: {
                accept: "application/json",
                "accept-language": request.headers.get("accept-language") ?? "fa",
                "content-type": request.headers.get("content-type") ?? "application/json",
                "idempotency-key": idempotencyKey,
                [TENANT_HEADER]: tenant,
            },
            body,
            cache: "no-store",
            signal: AbortSignal.timeout(15_000),
        });
        return new Response(upstream.body, {
            status: upstream.status,
            headers: {
                "content-type": upstream.headers.get("content-type") ?? "application/json",
                "cache-control": "no-store",
                "referrer-policy": "no-referrer",
                "x-content-type-options": "nosniff",
            },
        });
    } catch {
        return Response.json(
            { error: "factor_upstream_unavailable", message: "سرویس پرداخت در دسترس نیست." },
            { status: 502, headers: { "cache-control": "no-store" } },
        );
    }
}
