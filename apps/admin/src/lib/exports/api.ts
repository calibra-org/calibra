"use client";

/**
 * Browser-side client for the CSV exporter endpoints. Same shape as `lib/imports/api.ts` —
 * `apiMutate` for POST/PATCH/DELETE bodies, raw EventSource for the SSE stream, and a download
 * helper that builds the signed URL the wizard hands to a real `<a download>`.
 *
 * GET endpoints with array filters can't use the shared `apiGet` — its underlying
 * `URLSearchParams.set` call collapses duplicate keys, which would smash `["sku","name"]` into a
 * single `columns%5B%5D=sku%2Cname` value the AdonisJS `vine.array(...)` validator rejects.
 * Instead, we build the query string here with `URLSearchParams.append` so every element of an
 * array becomes its own `key[]=value` pair.
 */

import type {
    ExportCount,
    ExportFilters,
    ExportFormatOptions,
    ExportPreviewResult,
    ProductExportPreset,
    ProductExportRow,
    ProductExportShowResponse,
    ProductExportStreamEvent,
} from "#/lib/exports/types";
import { apiMutate } from "#/lib/queries/api-client";
import { getTransmit } from "#/lib/transmit";

function buildExportQueryString(filters: Record<string, unknown>): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) {
            for (const item of v) params.append(`${k}[]`, String(item));
        } else if (typeof v === "object") {
            params.set(k, JSON.stringify(v));
        } else {
            params.set(k, String(v));
        }
    }
    return params.toString();
}

async function getProxy<T>(path: string, locale: string, query: string = "", signal?: AbortSignal): Promise<T> {
    const url = query.length > 0 ? `/api/admin/${path}?${query}` : `/api/admin/${path}`;
    const res = await fetch(url, {
        method: "GET",
        headers: { "accept-language": locale, accept: "application/json" },
        signal,
    });
    if (!res.ok) {
        const body = await safeParseJson(res);
        throw Object.assign(new Error(`admin proxy returned ${res.status}`), { status: res.status, body });
    }
    return (await res.json()) as T;
}

async function safeParseJson(res: Response): Promise<unknown> {
    try {
        return await res.json();
    } catch {
        return await res.text();
    }
}

export function getExportCount(filters: ExportFilters, locale: string): Promise<{ data: ExportCount }> {
    return getProxy("products/export/count", locale, buildExportQueryString(filters as unknown as Record<string, unknown>));
}

export function getExportPreview(
    body: ExportFilters & { columns: string[] } & Pick<
            ExportFormatOptions,
            "digit_style" | "date_format" | "money_format" | "header_language"
        >,
    locale: string,
): Promise<{ data: ExportPreviewResult }> {
    return getProxy("products/export/preview", locale, buildExportQueryString(body as unknown as Record<string, unknown>));
}

export function startExport(
    body: ExportFilters &
        ExportFormatOptions & {
            columns: string[];
            scope?: "all" | "filter" | "selected" | "preset";
            save_as_preset?: boolean;
            preset_name?: string;
            preset_id?: number;
        },
    locale: string,
): Promise<{ data: ProductExportRow }> {
    return apiMutate("POST", "products/export/start", { locale, body });
}

export function getExport(id: number, locale: string, signal?: AbortSignal): Promise<ProductExportShowResponse> {
    return getProxy(`products/export/${id}`, locale, "", signal);
}

export function cancelExport(id: number, locale: string): Promise<{ data: ProductExportRow }> {
    return apiMutate("POST", `products/export/${id}/cancel`, { locale });
}

export function listExportHistory(
    locale: string,
    options: { page?: number; perPage?: number; status?: string; from?: string; to?: string } = {},
): Promise<{ data: ProductExportRow[]; meta: { page: number; perPage: number; total: number; lastPage: number } }> {
    return getProxy(
        "products/export/history",
        locale,
        buildExportQueryString({
            page: options.page,
            per_page: options.perPage,
            status: options.status,
            from: options.from,
            to: options.to,
        }),
    );
}

export function deleteExport(id: number, locale: string): Promise<void> {
    return apiMutate("DELETE", `products/export/${id}`, { locale });
}

export function listExportPresets(locale: string): Promise<{ data: ProductExportPreset[] }> {
    return getProxy("products/export/presets", locale);
}

export function createExportPreset(
    body: { name: string; filters: ExportFilters; columns: string[]; format_options?: ExportFormatOptions; is_default?: boolean },
    locale: string,
): Promise<{ data: ProductExportPreset }> {
    return apiMutate("POST", "products/export/presets", { locale, body });
}

export function updateExportPreset(
    id: number,
    body: { name: string; filters: ExportFilters; columns: string[]; format_options?: ExportFormatOptions; is_default?: boolean },
    locale: string,
): Promise<{ data: ProductExportPreset }> {
    return apiMutate("PATCH", `products/export/presets/${id}`, { locale, body });
}

export function deleteExportPreset(id: number, locale: string): Promise<void> {
    return apiMutate("DELETE", `products/export/presets/${id}`, { locale });
}

export function getDistinctMetaKeys(
    filters: ExportFilters & { show_hidden?: boolean; search?: string },
    locale: string,
): Promise<{ data: { keys: Array<{ key: string; count: number }> } }> {
    return getProxy("products/distinct-meta-keys", locale, buildExportQueryString(filters as unknown as Record<string, unknown>));
}

export interface ExportStreamHandlers {
    onEvent: (event: ProductExportStreamEvent) => void;
    onError?: (event: Event) => void;
    onOpen?: () => void;
}

/**
 * Subscribe to live exporter progress via `@adonisjs/transmit-client`. Returns an unsubscriber
 * the caller MUST invoke on unmount. The shared Transmit instance multiplexes channels over a
 * single SSE connection — see `apps/admin/src/lib/transmit.ts`.
 */
export function streamExport(id: number, handlers: ExportStreamHandlers): () => void {
    const subscription = getTransmit().subscription(`exports/${id}`);
    let alive = true;
    const off = subscription.onMessage<ProductExportStreamEvent>((event) => {
        if (!alive) return;
        handlers.onEvent(event);
        if (event.type === "complete" || event.type === "failed" || event.type === "cancelled") {
            alive = false;
            void subscription.delete();
        }
    });
    void subscription
        .create()
        .then(() => handlers.onOpen?.())
        .catch(() => handlers.onError?.(new Event("subscribe_failed")));
    return () => {
        if (!alive) return;
        alive = false;
        off();
        void subscription.delete();
    };
}

/** Build the download URL the wizard puts on the "Download" / "Copy link" buttons. */
export function exportDownloadUrl(id: number, token: string): string {
    const params = new URLSearchParams({ token });
    return `/api/admin/products/export/${id}/download?${params.toString()}`;
}
