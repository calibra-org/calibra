import type { NextRequest } from "next/server";

import { TENANT_HEADER } from "#/lib/tenant/constants";
import { resolveHost, tenantRefFor } from "#/lib/tenant/resolve-host";

interface RouteContext {
    params: Promise<{ code: string }>;
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
    const { code } = await context.params;
    const base = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!base) return Response.json({ error: "api_base_url_missing" }, { status: 500 });
    const tenant = tenantRefFor(resolveHost(request.headers.get("host")));
    if (!tenant) return Response.json({ error: "tenant_missing" }, { status: 404 });
    try {
        const upstream = await fetch(`${base.replace(/\/+$/, "")}/api/v1/factor/pay/${encodeURIComponent(code)}`, {
            method: "GET",
            headers: {
                accept: "application/json",
                "accept-language": request.headers.get("accept-language") ?? "fa",
                [TENANT_HEADER]: tenant,
            },
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
        });
        return new Response(upstream.body, {
            status: upstream.status,
            headers: {
                "content-type": upstream.headers.get("content-type") ?? "application/json",
                "cache-control": "private, no-store, max-age=0",
                "referrer-policy": "no-referrer",
                "x-robots-tag": "noindex, nofollow, noarchive",
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
