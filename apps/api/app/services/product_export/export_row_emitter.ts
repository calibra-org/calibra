import Papa from "papaparse";

import type { ExportableProduct, ExportFormatOptions } from "#services/product_export/export_field_resolver";
import { resolveRow } from "#services/product_export/export_field_resolver";
import { IMPORT_FIELD_BY_KEY } from "#services/product_import/import_field_catalog";

/**
 * Stateful row emitter the runner uses across chunks. The runner constructs one per export job,
 * writes the header line once, then calls `.appendRow(product)` for every product (and once per
 * variation when `include_variations` is on). At the end it calls `.close()` to flush.
 *
 * Header source-of-truth: the same `IMPORT_FIELDS` catalog the importer reads. When
 * `header_language: "fa"` is set, header strings are pulled from a Persian alias map maintained
 * in the same catalog (falls back to the field key when no alias).
 *
 * The emitter is format-agnostic: today it serializes via `Papa.unparse` (CSV) and `JSON.stringify`
 * (JSON line-delimited). XLSX is intentionally NOT supported until `exceljs` is added to the
 * pnpm catalog — the spec'd capability list calls that out as a future-phase item.
 */

export interface EmitterOptions extends ExportFormatOptions {
    format: "csv" | "json";
    delimiter: "," | ";" | "\t";
    enclosure?: string;
    encoding: "utf-8-bom" | "utf-8" | "windows-1256";
    line_ending: "\n" | "\r\n";
    header_language?: "en" | "fa";
}

export interface RowEmitter {
    /** Write the CSV/JSON header line. Call once before any `appendRow`. */
    writeHeader(): string;
    /** Serialize a single product row and return the chunk to be written. */
    appendRow(product: ExportableProduct): string;
    /** Optional close-of-file marker (e.g. JSON closing bracket). Empty string for CSV. */
    close(): string;
}

/**
 * Build a fresh emitter bound to the supplied column list + format options. The runner pipes
 * each chunk's bytes into a writable stream — keeping the emitter stateless across rows means
 * back-pressure is trivial (the runner controls the pacing).
 */
export function createRowEmitter(columns: readonly string[], opts: EmitterOptions): RowEmitter {
    if (opts.format === "json") return createJsonEmitter(columns, opts);
    return createCsvEmitter(columns, opts);
}

function createCsvEmitter(columns: readonly string[], opts: EmitterOptions): RowEmitter {
    const headers = columns.map((c) => resolveHeader(c, opts.header_language ?? "en"));
    const bom = opts.encoding === "utf-8-bom" ? "﻿" : "";
    const newline = opts.line_ending;
    const quoteChar = opts.enclosure ?? '"';

    let isFirstWrite = true;
    return {
        writeHeader(): string {
            const line = Papa.unparse([headers], {
                delimiter: opts.delimiter,
                newline,
                quoteChar,
                quotes: true,
            });
            isFirstWrite = false;
            return `${bom}${line}${newline}`;
        },
        appendRow(product: ExportableProduct): string {
            const row = resolveRow(product, columns, opts);
            const values = columns.map((c) => row[c] ?? "");
            const line = Papa.unparse([values], {
                delimiter: opts.delimiter,
                newline,
                quoteChar,
                quotes: true,
                header: false,
            });
            const prefix = isFirstWrite ? bom : "";
            isFirstWrite = false;
            return `${prefix}${line}${newline}`;
        },
        close(): string {
            return "";
        },
    };
}

function createJsonEmitter(columns: readonly string[], opts: EmitterOptions): RowEmitter {
    let firstRow = true;
    const newline = opts.line_ending;
    return {
        writeHeader(): string {
            return `[${newline}`;
        },
        appendRow(product: ExportableProduct): string {
            const row = resolveRow(product, columns, opts);
            const prefix = firstRow ? "  " : `,${newline}  `;
            firstRow = false;
            return `${prefix}${JSON.stringify(row)}`;
        },
        close(): string {
            return `${newline}]${newline}`;
        },
    };
}

/**
 * Map a field key to its header string in the chosen language. `en` uses the canonical key
 * (`regular_price`) — the importer's auto-mapper recognises this as itself, so round-trip is
 * lossless. `fa` uses the first Persian alias the catalog ships; if none is present (e.g. for
 * `meta:*` columns or fields that have only English aliases), fall back to the key.
 */
function resolveHeader(column: string, language: "en" | "fa"): string {
    if (column.startsWith("meta:")) return column;
    if (language === "en") return column;
    const field = IMPORT_FIELD_BY_KEY.get(column);
    if (field === undefined) return column;
    for (const alias of field.aliases) {
        if (/[؀-ۿ]/.test(alias)) return alias;
    }
    return column;
}
