import { readFile } from "node:fs/promises";
import Papa from "papaparse";
import * as XLSX from "xlsx";

/**
 * Result of parsing the uploaded file. Headers are in CSV order, every row in `rows` is a
 * `Record<headerName, cellValue>` where empty cells map to `""` (NOT `null` — the row validator
 * needs to distinguish "missing" from "explicitly empty" downstream). `totalRows` excludes the
 * header line. `samples` holds the first three distinct non-empty values per column for the Step 2
 * "اهه‌نومن" preview.
 */
export interface ParsedFile {
    headers: string[];
    rows: Array<Record<string, string>>;
    totalRows: number;
    detectedDelimiter: string;
    detectedEncoding: string;
    samples: Record<string, string[]>;
}

export interface ParseOptions {
    delimiter?: string | "auto";
    encoding?: string | "auto";
    /** When set, only the first N rows are parsed — used for the preview pane scan. */
    limit?: number;
}

const DEFAULT_OPTIONS: ParseOptions = {
    delimiter: "auto",
    encoding: "auto",
};

/**
 * Parse a CSV or XLSX file from disk. The dispatcher inspects the file extension and delegates to
 * the matching parser. Both code paths return the same `ParsedFile` so the runner doesn't care
 * which format the operator uploaded.
 */
export async function parseFile(filePath: string, options: ParseOptions = {}): Promise<ParsedFile> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const lower = filePath.toLowerCase();
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        return parseXlsx(filePath, opts);
    }
    return parseCsv(filePath, opts);
}

async function parseCsv(filePath: string, options: ParseOptions): Promise<ParsedFile> {
    const buffer = await readFile(filePath);
    const encoding = options.encoding === "auto" || options.encoding === undefined ? detectEncoding(buffer) : options.encoding;
    const text = decodeBuffer(buffer, encoding);

    const result = Papa.parse<string[]>(text, {
        delimiter: options.delimiter === "auto" || options.delimiter === undefined ? "" : options.delimiter,
        skipEmptyLines: "greedy",
        header: false,
        preview: options.limit !== undefined ? options.limit + 1 : 0,
    });

    const detectedDelimiter = (result.meta.delimiter as string) || ",";
    const rawRows = result.data;
    if (rawRows.length === 0) {
        return {
            headers: [],
            rows: [],
            totalRows: 0,
            detectedDelimiter,
            detectedEncoding: encoding,
            samples: {},
        };
    }

    const headers = normalizeHeaderRow(rawRows[0] ?? []);
    const rows: Array<Record<string, string>> = [];
    for (let i = 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.every((cell) => cell === undefined || cell === null || String(cell).trim() === "")) continue;
        rows.push(buildRecord(headers, row));
    }

    return {
        headers,
        rows,
        totalRows: rows.length,
        detectedDelimiter,
        detectedEncoding: encoding,
        samples: collectSamples(headers, rows),
    };
}

async function parseXlsx(filePath: string, options: ParseOptions): Promise<ParsedFile> {
    const workbook = XLSX.readFile(filePath, { cellDates: false, cellNF: false, cellText: true });
    const firstSheetName = workbook.SheetNames[0];
    if (firstSheetName === undefined) {
        return { headers: [], rows: [], totalRows: 0, detectedDelimiter: ",", detectedEncoding: "utf-8", samples: {} };
    }
    const sheet = workbook.Sheets[firstSheetName]!;
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
    if (matrix.length === 0) {
        return { headers: [], rows: [], totalRows: 0, detectedDelimiter: ",", detectedEncoding: "utf-8", samples: {} };
    }

    const headers = normalizeHeaderRow((matrix[0] as string[]) ?? []);
    const limit = options.limit !== undefined ? Math.min(options.limit + 1, matrix.length) : matrix.length;
    const rows: Array<Record<string, string>> = [];
    for (let i = 1; i < limit; i++) {
        const row = matrix[i] as string[] | undefined;
        if (!row || row.every((cell) => cell === undefined || cell === null || String(cell).trim() === "")) continue;
        rows.push(
            buildRecord(
                headers,
                row.map((c) => (c === undefined || c === null ? "" : String(c))),
            ),
        );
    }

    return {
        headers,
        rows,
        totalRows: rows.length,
        detectedDelimiter: ",",
        detectedEncoding: "utf-8",
        samples: collectSamples(headers, rows),
    };
}

/**
 * Strip BOM + trim each header. Duplicate header names are disambiguated with a `_2`, `_3`, …
 * suffix so the row dictionary never silently overwrites. Empty headers are replaced with
 * `column_<i>` so the mapping UI can still target them.
 */
function normalizeHeaderRow(raw: string[]): string[] {
    const seen = new Map<string, number>();
    return raw.map((h, idx) => {
        const cleaned = String(h ?? "")
            .replace(/^﻿/, "")
            .trim();
        const base = cleaned === "" ? `column_${idx + 1}` : cleaned;
        const seenCount = seen.get(base) ?? 0;
        seen.set(base, seenCount + 1);
        return seenCount === 0 ? base : `${base}_${seenCount + 1}`;
    });
}

function buildRecord(headers: string[], row: string[]): Record<string, string> {
    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
        const cell = row[i];
        record[headers[i]!] = cell === undefined || cell === null ? "" : String(cell);
    }
    return record;
}

/**
 * Collect up to three distinct, non-empty samples per column for the Step 2 sample preview.
 * Distinct-by-trimmed-string so `"299000"` and `" 299000 "` count as one.
 */
function collectSamples(headers: string[], rows: Array<Record<string, string>>): Record<string, string[]> {
    const samples: Record<string, Set<string>> = {};
    for (const header of headers) samples[header] = new Set<string>();
    for (const row of rows) {
        for (const header of headers) {
            const set = samples[header]!;
            if (set.size >= 3) continue;
            const value = (row[header] ?? "").trim();
            if (value === "") continue;
            set.add(value);
        }
        if (headers.every((h) => samples[h]!.size >= 3)) break;
    }
    const out: Record<string, string[]> = {};
    for (const header of headers) out[header] = Array.from(samples[header]!);
    return out;
}

/**
 * Naive encoding detection: BOM check → fallback to utf-8. The wizard exposes a manual override in
 * the advanced panel for cases where this picks wrong (e.g. legacy Windows-1256 exports from
 * older Iranian ERPs).
 */
function detectEncoding(buffer: Buffer): string {
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return "utf-8";
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return "utf-16le";
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return "utf-16be";
    return "utf-8";
}

function decodeBuffer(buffer: Buffer, encoding: string): string {
    if (encoding === "utf-8" || encoding === "utf8") {
        const decoder = new TextDecoder("utf-8");
        return decoder.decode(buffer);
    }
    try {
        const decoder = new TextDecoder(encoding);
        return decoder.decode(buffer);
    } catch {
        return buffer.toString("utf-8");
    }
}
