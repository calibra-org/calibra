"use client";

import type { Locale } from "@calibra/shared/i18n";
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";
import type { AdminMedia, AdminMediaKind, AdminMediaVariants, Paginated } from "#/lib/types";

import type { MediaTypeFilter } from "./types";

/**
 * Listing parameter set used by both the live query and the SSR cache seed key. Field names match
 * the TableView wire grammar (`q`, not `search`) so this client query and the SSR `listMedia`
 * server-repo speak one vocabulary, even though the media page keeps its filter state local rather
 * than URL-backed (a follow-up could adopt `useTableView` here — see PR notes).
 */
export interface MediaListParams {
    page?: number;
    limit?: number;
    q?: string;
    type?: MediaTypeFilter;
    month?: string;
}

interface MediaListEnvelope {
    data: AdminMediaWire[];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}

interface MediaResourceEnvelope {
    data: AdminMediaWire;
}

/**
 * The wire shape the API returns. Mirrors the OpenAPI schema. We keep an internal alias so this
 * module isn't coupled to the generated SDK types — the next renames of `size_bytes` etc.
 * happen here and the view code keeps using {@link AdminMedia}.
 */
interface AdminMediaWire {
    id: number;
    kind: AdminMediaKind;
    url: string;
    filename: string;
    title: string | null;
    alt: string | null;
    caption: string | null;
    description: string | null;
    mime: string | null;
    width: number | null;
    height: number | null;
    variants: AdminMediaVariants | null;
    size_bytes: number | null;
    uploaded_by_user_id: number | null;
    created_at: string | null;
    updated_at: string | null;
}

function toAdminMedia(row: AdminMediaWire): AdminMedia {
    return {
        id: row.id,
        kind: row.kind,
        url: row.url,
        filename: row.filename,
        title: row.title,
        alt: row.alt,
        caption: row.caption,
        description: row.description,
        mime: row.mime,
        width: row.width,
        height: row.height,
        variants: row.variants,
        sizeBytes: row.size_bytes,
        uploadedByUserId: row.uploaded_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

const LIST_KEY = ["admin", "media", "list"] as const;
const MONTHS_KEY = ["admin", "media", "months"] as const;

/** Browser-side media list — filters round-trip through the listing endpoint. */
export function useMediaList(params: MediaListParams = {}): UseQueryResult<Paginated<AdminMedia>, Error> {
    const locale = useLocale() as Locale;
    const page = params.page ?? 1;
    const limit = params.limit ?? 60;
    const q = params.q;
    const type = params.type ?? "all";
    const month = params.month;
    return useQuery<MediaListEnvelope, Error, Paginated<AdminMedia>>({
        queryKey: ["admin", "media", "list", { locale, page, limit, q, type, month }],
        queryFn: () =>
            apiGet<MediaListEnvelope>("media", {
                locale,
                query: {
                    page,
                    limit,
                    ...(q !== undefined && q.length > 0 ? { q } : {}),
                    ...(type !== "all" ? { type } : {}),
                    ...(month !== undefined && month.length > 0 ? { month } : {}),
                },
            }),
        select: (payload) => ({
            data: (payload.data ?? []).map(toAdminMedia),
            meta: payload.meta ?? { page, limit, total: payload.data?.length ?? 0, lastPage: 1 },
        }),
        staleTime: 30_000,
    });
}

/** Fetch a single row — used by the modal when prev/next reaches a row not in the cached list. */
export function useMedia(id: number | null): UseQueryResult<AdminMedia, Error> {
    const locale = useLocale() as Locale;
    return useQuery<MediaResourceEnvelope, Error, AdminMedia>({
        queryKey: ["admin", "media", "detail", { locale, id }],
        queryFn: () => apiGet<MediaResourceEnvelope>(`media/${id}`, { locale }),
        select: (payload) => toAdminMedia(payload.data),
        staleTime: 30_000,
        enabled: id !== null,
    });
}

/** Distinct `YYYY-MM` buckets — server-side; falls back to whatever the SSR seed provided. */
export function useMediaMonths(): UseQueryResult<string[], Error> {
    const locale = useLocale() as Locale;
    return useQuery<{ data: string[] }, Error, string[]>({
        queryKey: [...MONTHS_KEY, locale],
        queryFn: () => apiGet<{ data: string[] }>("media/months", { locale }),
        select: (payload) => payload.data ?? [],
        staleTime: 60_000,
    });
}

export interface UpdateMediaInput {
    id: number;
    title?: string | null;
    alt?: string | null;
    caption?: string | null;
    description?: string | null;
    filename?: string;
}

/**
 * Partial-update a media row. Optimistically replaces the row in every cached list snapshot
 * so the modal autosave reflects in the underlying grid immediately; on error the snapshot is
 * restored and the listing is invalidated.
 */
export function useUpdateMedia() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<
        MediaResourceEnvelope,
        Error,
        UpdateMediaInput,
        { previous: [readonly unknown[], MediaListEnvelope | undefined][] }
    >({
        mutationFn: ({ id, ...rest }) => apiMutate<MediaResourceEnvelope>("PATCH", `media/${id}`, { locale, body: rest }),
        onMutate: async ({ id, ...rest }) => {
            await queryClient.cancelQueries({ queryKey: LIST_KEY });
            const previous = queryClient.getQueriesData<MediaListEnvelope>({ queryKey: LIST_KEY });
            for (const [key, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<MediaListEnvelope>(key, {
                    ...snapshot,
                    data: snapshot.data.map((row) => (row.id === id ? mergeWire(row, rest) : row)),
                });
            }
            return { previous };
        },
        onError: (_error, _vars, context) => {
            if (context === undefined) return;
            for (const [key, snapshot] of context.previous) queryClient.setQueryData(key, snapshot);
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: LIST_KEY });
        },
    });
}

/** Delete a single media row. Drops it from every cached list snapshot. */
export function useDeleteMedia() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<void, Error, { id: number }, { previous: [readonly unknown[], MediaListEnvelope | undefined][] }>({
        mutationFn: async ({ id }) => {
            await apiMutate<void>("DELETE", `media/${id}`, { locale });
        },
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: LIST_KEY });
            const previous = queryClient.getQueriesData<MediaListEnvelope>({ queryKey: LIST_KEY });
            for (const [key, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<MediaListEnvelope>(key, {
                    ...snapshot,
                    data: snapshot.data.filter((row) => row.id !== id),
                });
            }
            return { previous };
        },
        onError: (_error, _vars, context) => {
            if (context === undefined) return;
            for (const [key, snapshot] of context.previous) queryClient.setQueryData(key, snapshot);
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: LIST_KEY });
        },
    });
}

/**
 * Sequentially delete a batch of rows. Sequential is intentional — the upstream's per-request
 * accounting stays honest and partial failures still benefit from the optimistic cache strip.
 */
export function useBulkDeleteMedia() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<void, Error, { ids: number[] }, { previous: [readonly unknown[], MediaListEnvelope | undefined][] }>({
        mutationFn: async ({ ids }) => {
            for (const id of ids) {
                await apiMutate<void>("DELETE", `media/${id}`, { locale });
            }
        },
        onMutate: async ({ ids }) => {
            await queryClient.cancelQueries({ queryKey: LIST_KEY });
            const previous = queryClient.getQueriesData<MediaListEnvelope>({ queryKey: LIST_KEY });
            const drop = new Set(ids);
            for (const [key, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<MediaListEnvelope>(key, {
                    ...snapshot,
                    data: snapshot.data.filter((row) => !drop.has(row.id)),
                });
            }
            return { previous };
        },
        onError: (_error, _vars, context) => {
            if (context === undefined) return;
            for (const [key, snapshot] of context.previous) queryClient.setQueryData(key, snapshot);
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: LIST_KEY });
        },
    });
}

/**
 * Multipart upload through the same-origin admin proxy. `apiMutate` only serialises JSON bodies,
 * so we hit the proxy directly with FormData here — the proxy forwards the raw body upstream.
 * CSRF is stamped from the same cookie {@link apiMutate} reads.
 */
export interface UploadMediaInput {
    file: File;
    onProgress?: (percent: number) => void;
}

export function useUploadMedia() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<AdminMedia, Error, UploadMediaInput>({
        mutationFn: async ({ file, onProgress }) => {
            const csrf = readCsrfToken();
            if (csrf === undefined) throw new Error("missing_csrf");
            const body = new FormData();
            body.append("file", file);
            const payload = await uploadWithProgress({
                url: "/api/admin/media",
                body,
                headers: {
                    "accept-language": locale,
                    accept: "application/json",
                    "x-csrf-token": csrf,
                },
                onProgress,
            });
            return toAdminMedia(payload.data);
        },
        onSuccess: (created) => {
            const snapshots = queryClient.getQueriesData<MediaListEnvelope>({ queryKey: LIST_KEY });
            const wire = adminMediaToWire(created);
            for (const [key, snapshot] of snapshots) {
                if (snapshot === undefined) continue;
                if (snapshot.data.some((row) => row.id === created.id)) continue;
                queryClient.setQueryData<MediaListEnvelope>(key, {
                    ...snapshot,
                    data: [wire, ...snapshot.data],
                    meta: snapshot.meta
                        ? { ...snapshot.meta, total: snapshot.meta.total + 1 }
                        : { page: 1, limit: snapshot.data.length + 1, total: snapshot.data.length + 1, lastPage: 1 },
                });
            }
            void queryClient.invalidateQueries({ queryKey: LIST_KEY });
            void queryClient.invalidateQueries({ queryKey: MONTHS_KEY });
        },
    });
}

function readCsrfToken(): string | undefined {
    if (typeof document === "undefined") return undefined;
    const match = document.cookie.match(/(?:^|;\s*)admin_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
}

interface UploadArgs {
    url: string;
    body: FormData;
    headers: Record<string, string>;
    onProgress?: (percent: number) => void;
}

/**
 * Wrap `XMLHttpRequest` so we get a real progress event — `fetch` exposes a `ReadableStream` for
 * the response but not the upload, and the dropzone needs a per-file progress bar.
 */
function uploadWithProgress({ url, body, headers, onProgress }: UploadArgs): Promise<MediaResourceEnvelope> {
    return new Promise<MediaResourceEnvelope>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
        xhr.upload.addEventListener("progress", (event) => {
            if (!event.lengthComputable || onProgress === undefined) return;
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
        });
        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(JSON.parse(xhr.responseText) as MediaResourceEnvelope);
                } catch (err) {
                    reject(err instanceof Error ? err : new Error("parse_error"));
                }
                return;
            }
            reject(new Error(`upload_failed_${xhr.status}`));
        });
        xhr.addEventListener("error", () => reject(new Error("network_error")));
        xhr.addEventListener("abort", () => reject(new Error("aborted")));
        xhr.send(body);
    });
}

function mergeWire(row: AdminMediaWire, update: Omit<UpdateMediaInput, "id">): AdminMediaWire {
    return {
        ...row,
        ...(update.title !== undefined ? { title: update.title } : {}),
        ...(update.alt !== undefined ? { alt: update.alt } : {}),
        ...(update.caption !== undefined ? { caption: update.caption } : {}),
        ...(update.description !== undefined ? { description: update.description } : {}),
        ...(update.filename !== undefined ? { filename: update.filename } : {}),
    };
}

function adminMediaToWire(row: AdminMedia): AdminMediaWire {
    return {
        id: row.id,
        kind: row.kind,
        url: row.url,
        filename: row.filename,
        title: row.title,
        alt: row.alt,
        caption: row.caption,
        description: row.description,
        mime: row.mime,
        width: row.width,
        height: row.height,
        variants: row.variants,
        size_bytes: row.sizeBytes,
        uploaded_by_user_id: row.uploadedByUserId,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
    };
}

/** Key used by the page to plant the SSR snapshot into the React Query cache. */
export function seedMediaListKey({ locale, limit }: { locale: Locale; limit: number }) {
    return [
        "admin",
        "media",
        "list",
        { locale, page: 1, limit, q: undefined, type: "all" as MediaTypeFilter, month: undefined },
    ] as const;
}

/** Identity helper to keep the page-side cache seeding short. */
export function adminMediaListToEnvelope(rows: AdminMedia[], meta: Paginated<AdminMedia>["meta"]): MediaListEnvelope {
    return { data: rows.map(adminMediaToWire), meta };
}
