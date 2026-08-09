import "server-only";

import { headers } from "next/headers";

import { TENANT_HEADER } from "#/lib/tenant/constants";
import { resolveHost, tenantRefFor } from "#/lib/tenant/resolve-host";

export type PublicSeoEntityKind = "product" | "category" | "brand" | "attribute" | "content_post" | "media" | "page";

export interface PublicSeoEntity {
    kind: PublicSeoEntityKind;
    id: number | null;
    locale: string;
    title: string | null;
    description: string | null;
    canonical_url: string | null;
    robots_index: boolean;
    robots_follow: boolean;
    og_title: string | null;
    og_description: string | null;
    schema: Record<string, unknown> | null;
    organization: Record<string, unknown> | null;
}

function apiBase(): string {
    return (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3333").replace(/\/$/, "");
}

async function tenantReference(): Promise<string | null> {
    const requestHeaders = await headers();
    const forwarded = requestHeaders.get(TENANT_HEADER);
    if (forwarded) return forwarded;
    return tenantRefFor(resolveHost(requestHeaders.get("host")));
}

async function seoFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const tenant = await tenantReference();
    const requestHeaders = new Headers(init.headers);
    requestHeaders.set("accept", requestHeaders.get("accept") || "application/json");
    if (tenant) requestHeaders.set(TENANT_HEADER, tenant);
    return fetch(`${apiBase()}${path}`, {
        ...init,
        headers: requestHeaders,
        cache: "no-store",
        signal: AbortSignal.timeout(7_000),
    });
}

export async function getPublicSeoEntity(kind: PublicSeoEntityKind, id: number, locale: string): Promise<PublicSeoEntity | null> {
    try {
        const response = await seoFetch(
            `/api/v1/seo/entity/${encodeURIComponent(kind)}/${id}?locale=${encodeURIComponent(locale)}`,
        );
        if (response.status === 404) return null;
        if (!response.ok) return null;
        const payload = (await response.json()) as { data?: PublicSeoEntity };
        return payload.data ?? null;
    } catch {
        return null;
    }
}

export async function getPublicOrganization(): Promise<Record<string, unknown> | null> {
    try {
        const response = await seoFetch("/api/v1/seo/organization");
        if (!response.ok) return null;
        const payload = (await response.json()) as { data?: Record<string, unknown> | null };
        return payload.data ?? null;
    } catch {
        return null;
    }
}

export async function proxyPublicSeoDocument(path: "/api/v1/seo/robots" | "/api/v1/seo/sitemap.xml"): Promise<Response> {
    return seoFetch(path, { headers: { accept: path.endsWith("robots") ? "text/plain" : "application/xml" } });
}

export interface PublicSeoRedirect {
    target_path: string | null;
    status_code: 301 | 302 | 307 | 308 | 410;
}

export async function resolvePublicSeoRedirect(path: string): Promise<PublicSeoRedirect | null> {
    try {
        const response = await seoFetch(`/api/v1/seo/redirect?path=${encodeURIComponent(path)}`);
        if (!response.ok) return null;
        const payload = (await response.json()) as { data?: PublicSeoRedirect | null };
        return payload.data ?? null;
    } catch {
        return null;
    }
}
