import type { Locale } from "@calibra/shared/i18n";

import type { AdminMedia } from "#/lib/types";

/** Library types matching the API's `type=` filter set, minus `all`. */
export type MediaTypeFilter =
    | "all"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "spreadsheet"
    | "archive"
    | "unattached"
    | "mine";

/** UI view variant — toggled by the operator in the toolbar, persisted in the URL as `?view=`. */
export type MediaViewMode = "grid" | "list";

/**
 * Granular classifier used by the tile renderer, the filter dropdown, and the modal preview.
 * The server's coarse `kind` (`image` / `file`) doesn't know whether a `file` is audio, video,
 * or a document — we derive it from MIME so a `.mp3` lands on the right pill instead of the
 * generic "Documents" bucket. Keep in sync with `MIME_GROUPS` in the API controller.
 */
export type MediaCategory = "image" | "audio" | "video" | "document" | "spreadsheet" | "archive" | "other";

/**
 * Inspect a MIME string and return the granular category. The mapping is exhaustive for the
 * common types the e-commerce flow needs (product images, instruction PDFs, catalogue
 * spreadsheets, downloadable archives, demo videos, audio samples). Unknown MIMEs fall back to
 * `"other"` so the UI never blows up — the tile shows the generic file icon.
 */
export function classifyMediaType(mime: string | null): MediaCategory {
    if (mime === null || mime.length === 0) return "other";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("video/")) return "video";
    if (DOCUMENT_MIMES.has(mime)) return "document";
    if (SPREADSHEET_MIMES.has(mime)) return "spreadsheet";
    if (ARCHIVE_MIMES.has(mime)) return "archive";
    if (mime.startsWith("text/")) return "document";
    return "other";
}

const DOCUMENT_MIMES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/rtf",
    "text/plain",
    "text/markdown",
    "text/html",
]);

const SPREADSHEET_MIMES = new Set([
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "application/vnd.oasis.opendocument.spreadsheet",
]);

const ARCHIVE_MIMES = new Set([
    "application/zip",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    "application/x-tar",
    "application/gzip",
    "application/x-bzip2",
]);

/** Returns `YYYY-MM` for an ISO timestamp; falls back to `""` for unparseable input. */
export function monthBucketFromIso(iso: string | null | undefined): string {
    if (iso === null || iso === undefined || iso.length === 0) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.valueOf())) return "";
    const yyyy = String(date.getUTCFullYear());
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
}

/**
 * Take a list of rows + the server-provided month buckets and merge them with the months
 * present in the rows themselves, deduplicated and ordered newest-first. Useful when the
 * server hasn't been queried yet but the SSR seed already carries some rows.
 */
export function buildMonthOptions(rows: readonly AdminMedia[], serverMonths: readonly string[]): string[] {
    const set = new Set<string>(serverMonths);
    for (const row of rows) {
        const bucket = monthBucketFromIso(row.createdAt);
        if (bucket.length > 0) set.add(bucket);
    }
    const list = Array.from(set).filter((m) => /^\d{4}-\d{2}$/.test(m));
    list.sort((a, b) => b.localeCompare(a));
    return list;
}

/** Persian digit transliteration map. Keeps the heavyweight number formatter out of helpers that
 * format a single small digit cluster (a year, a file-size cell). */
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function localizeDigits(value: string, locale: Locale): string {
    if (locale !== "fa") return value;
    return value.replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)] ?? digit);
}

/** Render `2026-05` as `May 2026` / `می ۲۰۲۶`, using the namespace's month name + locale digits. */
export function formatMonthLabel(month: string, locale: Locale, monthName: (key: string) => string): string {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (match === null) return month;
    const year = localizeDigits(match[1] ?? "", locale);
    const monthLabel = monthName(match[2] ?? "");
    return `${monthLabel} ${year}`;
}

/** Locale-aware human file size — keeps the value to one decimal where useful. */
export function formatFileSize(bytes: number | null, locale: Locale): string {
    if (bytes === null || bytes <= 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    const rounded = unit === 0 ? value.toString() : value.toFixed(value >= 100 ? 0 : 1);
    return `${localizeDigits(rounded, locale)} ${units[unit]}`;
}
