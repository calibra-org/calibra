"use client";

/**
 * Browser-side client for the CSV importer endpoints. Uses `apiGet` / `apiMutate` for JSON paths
 * and raw `fetch` for the multipart upload + SSE stream, since the helpers don't support those
 * shapes. CSRF token is included on every mutation (multipart upload included).
 */

import type {
    PreviewResult,
    ProductImportChangeRow,
    ProductImportErrorRow,
    ProductImportRow,
    ProductImportStreamEvent,
    ProductImportUploadResponse,
} from "#/lib/imports/types";
import { apiGet, apiMutate } from "#/lib/queries/api-client";

function getCsrfToken(): string | undefined {
    if (typeof document === "undefined") return undefined;
    const match = document.cookie.match(/(?:^|;\s*)admin_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
}

export interface UploadOptions {
    file: File;
    locale: string;
    delimiter?: "auto" | "," | ";" | "\t";
    encoding?: "auto" | "utf-8" | "windows-1256";
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
}

/**
 * Multipart upload to `/api/admin/products/import/upload`. Implemented with `XMLHttpRequest`
 * (not `fetch`) so we get a real upload-progress event the dropzone needs. The proxy forwards the
 * body as-is.
 */
export function uploadImportFile(options: UploadOptions): Promise<ProductImportUploadResponse> {
    return new Promise((resolve, reject) => {
        const csrf = getCsrfToken();
        if (csrf === undefined) {
            reject(new Error("missing csrf token cookie"));
            return;
        }
        const form = new FormData();
        form.append("file", options.file);
        if (options.delimiter !== undefined) form.append("delimiter", options.delimiter);
        if (options.encoding !== undefined) form.append("encoding", options.encoding);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/admin/products/import/upload");
        xhr.setRequestHeader("accept", "application/json");
        xhr.setRequestHeader("accept-language", options.locale);
        xhr.setRequestHeader("x-csrf-token", csrf);

        if (options.onProgress !== undefined) {
            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) {
                    options.onProgress!(Math.round((e.loaded / e.total) * 100));
                }
            });
        }

        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(JSON.parse(xhr.responseText) as ProductImportUploadResponse);
                } catch (err) {
                    reject(err);
                }
            } else {
                let body: unknown;
                try {
                    body = JSON.parse(xhr.responseText);
                } catch {
                    body = xhr.responseText;
                }
                reject(Object.assign(new Error(`upload failed: ${xhr.status}`), { status: xhr.status, body }));
            }
        });
        xhr.addEventListener("error", () => reject(new Error("network error during upload")));
        xhr.addEventListener("abort", () => reject(new Error("upload aborted")));
        options.signal?.addEventListener("abort", () => xhr.abort());

        xhr.send(form);
    });
}

export function getImport(id: number, locale: string, signal?: AbortSignal): Promise<{ data: ProductImportRow }> {
    return apiGet(`products/import/${id}`, { locale, signal });
}

export function previewImport(
    body: { import_id: number; mapping: Record<string, string | null>; update_existing: boolean },
    locale: string,
): Promise<{ data: PreviewResult }> {
    return apiMutate("POST", "products/import/preview", { locale, body });
}

export function startImport(
    body: {
        import_id: number;
        mapping: Record<string, string | null>;
        update_existing: boolean;
        save_preset?: boolean;
        preset_name?: string;
    },
    locale: string,
): Promise<{ data: ProductImportRow }> {
    return apiMutate("POST", "products/import/start", { locale, body });
}

export function cancelImport(id: number, locale: string): Promise<{ data: ProductImportRow }> {
    return apiMutate("POST", `products/import/${id}/cancel`, { locale });
}

export function listImportErrors(
    id: number,
    locale: string,
    options: { page?: number; perPage?: number; severity?: "error" | "warning"; includeResolved?: boolean } = {},
): Promise<{ data: ProductImportErrorRow[]; meta: { page: number; perPage: number; total: number; lastPage: number } }> {
    return apiGet(`products/import/${id}/errors`, {
        locale,
        query: {
            page: options.page,
            per_page: options.perPage,
            severity: options.severity,
            include_resolved: options.includeResolved,
        },
    });
}

export function retryImportRow(
    importId: number,
    body: { error_id: number; value: string | null },
    locale: string,
): Promise<{ data: ProductImportErrorRow }> {
    return apiMutate("POST", `products/import/${importId}/retry-row`, { locale, body });
}

export function retryFailedImport(
    importId: number,
    body: { edits: Array<{ error_id: number; value: string | null }> },
    locale: string,
): Promise<{ data: { queued: number } }> {
    return apiMutate("POST", `products/import/${importId}/retry-failed`, { locale, body });
}

export function rollbackImport(id: number, locale: string): Promise<{ data: ProductImportRow }> {
    return apiMutate("POST", `products/import/${id}/rollback`, { locale });
}

export function listImportHistory(
    locale: string,
    options: {
        page?: number;
        perPage?: number;
        status?: string;
        userId?: number;
        presetId?: number;
        from?: string;
        to?: string;
    } = {},
): Promise<{ data: ProductImportRow[]; meta: { page: number; perPage: number; total: number; lastPage: number } }> {
    return apiGet("products/import/history", {
        locale,
        query: {
            page: options.page,
            per_page: options.perPage,
            status: options.status,
            user_id: options.userId,
            preset_id: options.presetId,
            from: options.from,
            to: options.to,
        },
    });
}

export function listImportChanges(
    id: number,
    locale: string,
    options: { sku?: string; page?: number; perPage?: number } = {},
): Promise<{ data: ProductImportChangeRow[]; meta: { page: number; perPage: number; total: number; lastPage: number } }> {
    return apiGet(`products/import/${id}/changes`, {
        locale,
        query: { sku: options.sku, page: options.page, per_page: options.perPage },
    });
}

/**
 * Open an SSE stream for one import. Returns an unsubscriber. The browser EventSource doesn't
 * support custom headers, but the same-origin proxy reads the session cookie automatically, so
 * the bearer + locale flow through as on any other request.
 */
export interface StreamHandlers {
    onEvent: (event: ProductImportStreamEvent) => void;
    onError?: (event: Event) => void;
    onOpen?: () => void;
}

export function streamImport(id: number, handlers: StreamHandlers): () => void {
    const source = new EventSource(`/api/admin/products/import/${id}/stream`);
    source.addEventListener("open", () => handlers.onOpen?.());
    source.addEventListener("error", (event) => handlers.onError?.(event));
    const dispatch = (e: MessageEvent<string>) => {
        try {
            const parsed = JSON.parse(e.data) as ProductImportStreamEvent;
            handlers.onEvent(parsed);
            if (
                parsed.type === "complete" ||
                parsed.type === "failed" ||
                parsed.type === "cancelled" ||
                parsed.type === "rolled_back"
            ) {
                source.close();
            }
        } catch {
            /** Malformed payload — surface as error so the UI can fall back to polling. */
            handlers.onError?.(new Event("parse_error"));
        }
    };
    for (const type of ["progress", "chunk_start", "chunk_complete", "complete", "failed", "cancelled", "rolled_back"]) {
        source.addEventListener(type, dispatch as EventListener);
    }
    return () => source.close();
}

export function importTemplateUrl(): string {
    return "/api/admin/products/import/template";
}

export function importErrorReportUrl(id: number): string {
    return `/api/admin/products/import/${id}/errors?format=csv&page=1&per_page=10000`;
}
