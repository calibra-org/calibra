"use client";

/**
 * Browser-side client for the CSV exporter endpoints. Same shape as `lib/imports/api.ts` —
 * `apiGet` / `apiMutate` for JSON paths, raw EventSource for the SSE stream, and a download
 * helper that builds the signed URL the wizard hands to a real `<a download>`.
 *
 * Filter envelopes go into the URL query string for GET endpoints; the helper here serializes
 * arrays with bracketed indices (`?status[]=publish&status[]=draft`) so the AdonisJS validator
 * sees them as a real array.
 */

import type {
    ExportCount,
    ExportFilters,
    ExportFormatOptions,
    ExportPreviewResult,
    ProductExportPreset,
    ProductExportRow,
    ProductExportStreamEvent,
} from "#/lib/exports/types";
import { apiGet, apiMutate } from "#/lib/queries/api-client";

/**
 * Convert a filter envelope into a query-string object the underlying helper can consume. The
 * helper turns arrays into bracketed-index pairs and skips undefined / null values.
 */
function filtersToQuery(filters: Record<string, unknown>): Record<string, string | number | boolean | undefined | null> {
    const out: Record<string, string | number | boolean | undefined | null> = {};
    for (const [k, v] of Object.entries(filters)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) {
            for (const item of v) {
                /** Bracketed-indices: the helper appends each separately when key ends with `[]`. */
                appendInto(out, `${k}[]`, item);
            }
        } else if (typeof v === "object") {
            out[k] = JSON.stringify(v);
        } else {
            out[k] = v as string | number | boolean;
        }
    }
    return out;
}

function appendInto(out: Record<string, string | number | boolean | undefined | null>, key: string, value: unknown): void {
    /** URLSearchParams supports duplicate keys, so we just keep appending; the GET helper iterates entries. */
    const existing = out[key];
    if (existing === undefined) {
        out[key] = String(value);
        return;
    }
    out[key] = `${existing as string},${String(value)}`;
}

export function getExportCount(filters: ExportFilters, locale: string): Promise<{ data: ExportCount }> {
    return apiGet("products/export/count", { locale, query: filtersToQuery(filters as unknown as Record<string, unknown>) });
}

export function getExportPreview(
    body: ExportFilters & { columns: string[] } & Pick<
            ExportFormatOptions,
            "digit_style" | "date_format" | "money_format" | "header_language"
        >,
    locale: string,
): Promise<{ data: ExportPreviewResult }> {
    return apiGet("products/export/preview", { locale, query: filtersToQuery(body as unknown as Record<string, unknown>) });
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

export function getExport(id: number, locale: string, signal?: AbortSignal): Promise<{ data: ProductExportRow }> {
    return apiGet(`products/export/${id}`, { locale, signal });
}

export function cancelExport(id: number, locale: string): Promise<{ data: ProductExportRow }> {
    return apiMutate("POST", `products/export/${id}/cancel`, { locale });
}

export function listExportHistory(
    locale: string,
    options: { page?: number; perPage?: number; status?: string; from?: string; to?: string } = {},
): Promise<{ data: ProductExportRow[]; meta: { page: number; perPage: number; total: number; lastPage: number } }> {
    return apiGet("products/export/history", {
        locale,
        query: {
            page: options.page,
            per_page: options.perPage,
            status: options.status,
            from: options.from,
            to: options.to,
        },
    });
}

export function deleteExport(id: number, locale: string): Promise<void> {
    return apiMutate("DELETE", `products/export/${id}`, { locale });
}

export function listExportPresets(locale: string): Promise<{ data: ProductExportPreset[] }> {
    return apiGet("products/export/presets", { locale });
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
    return apiGet("products/distinct-meta-keys", {
        locale,
        query: filtersToQuery(filters as unknown as Record<string, unknown>),
    });
}

/**
 * Open the SSE stream for one export. Returns an unsubscriber. The browser's `EventSource` can't
 * carry custom headers, but the same-origin proxy reads the session cookie automatically.
 */
export interface ExportStreamHandlers {
    onEvent: (event: ProductExportStreamEvent) => void;
    onError?: (event: Event) => void;
    onOpen?: () => void;
}

export function streamExport(id: number, handlers: ExportStreamHandlers): () => void {
    const source = new EventSource(`/api/admin/products/export/${id}/stream`);
    source.addEventListener("open", () => handlers.onOpen?.());
    source.addEventListener("error", (event) => handlers.onError?.(event));
    const dispatch = (e: MessageEvent<string>) => {
        try {
            const parsed = JSON.parse(e.data) as ProductExportStreamEvent;
            handlers.onEvent(parsed);
            if (parsed.type === "complete" || parsed.type === "failed" || parsed.type === "cancelled") {
                source.close();
            }
        } catch {
            handlers.onError?.(new Event("parse_error"));
        }
    };
    for (const type of [
        "reading_products",
        "chunk_start",
        "chunk_complete",
        "slow_chunk",
        "compressing",
        "complete",
        "failed",
        "cancelled",
    ]) {
        source.addEventListener(type, dispatch as EventListener);
    }
    return () => source.close();
}

/** Build the download URL the wizard puts on the "Download" / "Copy link" buttons. */
export function exportDownloadUrl(id: number, token: string): string {
    const params = new URLSearchParams({ token });
    return `/api/admin/products/export/${id}/download?${params.toString()}`;
}
