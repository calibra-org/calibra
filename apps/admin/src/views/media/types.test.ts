import { describe, expect, it } from "vitest";

import { buildMonthOptions, classifyMediaType, formatFileSize, formatMonthLabel, monthBucketFromIso } from "./types";

describe("classifyMediaType", () => {
    it("maps image MIMEs to image", () => {
        expect(classifyMediaType("image/jpeg")).toBe("image");
        expect(classifyMediaType("image/png")).toBe("image");
        expect(classifyMediaType("image/webp")).toBe("image");
        expect(classifyMediaType("image/svg+xml")).toBe("image");
    });

    it("maps audio MIMEs to audio", () => {
        expect(classifyMediaType("audio/mpeg")).toBe("audio");
        expect(classifyMediaType("audio/wav")).toBe("audio");
    });

    it("maps video MIMEs to video", () => {
        expect(classifyMediaType("video/mp4")).toBe("video");
        expect(classifyMediaType("video/webm")).toBe("video");
    });

    it("recognises office documents and PDFs as document", () => {
        expect(classifyMediaType("application/pdf")).toBe("document");
        expect(classifyMediaType("application/msword")).toBe("document");
        expect(classifyMediaType("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("document");
        expect(classifyMediaType("text/plain")).toBe("document");
    });

    it("recognises spreadsheets", () => {
        expect(classifyMediaType("application/vnd.ms-excel")).toBe("spreadsheet");
        expect(classifyMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("spreadsheet");
        expect(classifyMediaType("text/csv")).toBe("spreadsheet");
    });

    it("recognises archives", () => {
        expect(classifyMediaType("application/zip")).toBe("archive");
        expect(classifyMediaType("application/x-rar-compressed")).toBe("archive");
        expect(classifyMediaType("application/gzip")).toBe("archive");
    });

    it("falls back to 'other' for unknown MIMEs and null", () => {
        expect(classifyMediaType("application/octet-stream")).toBe("other");
        expect(classifyMediaType(null)).toBe("other");
        expect(classifyMediaType("")).toBe("other");
    });
});

describe("monthBucketFromIso", () => {
    it("returns YYYY-MM in UTC", () => {
        expect(monthBucketFromIso("2026-05-23T10:00:00Z")).toBe("2026-05");
        expect(monthBucketFromIso("2025-12-01T00:00:00Z")).toBe("2025-12");
    });

    it("pads single-digit months", () => {
        expect(monthBucketFromIso("2026-01-15T00:00:00Z")).toBe("2026-01");
    });

    it("handles null / undefined / bad input gracefully", () => {
        expect(monthBucketFromIso(null)).toBe("");
        expect(monthBucketFromIso(undefined)).toBe("");
        expect(monthBucketFromIso("")).toBe("");
        expect(monthBucketFromIso("not-a-date")).toBe("");
    });
});

describe("buildMonthOptions", () => {
    it("merges server months with row-derived months, newest first", () => {
        const rows = [
            mockRow({ id: 1, createdAt: "2026-05-01T00:00:00Z" }),
            mockRow({ id: 2, createdAt: "2025-11-15T00:00:00Z" }),
        ];
        const server = ["2026-04", "2026-05"];
        expect(buildMonthOptions(rows, server)).toEqual(["2026-05", "2026-04", "2025-11"]);
    });

    it("dedupes and drops malformed buckets", () => {
        const rows = [mockRow({ id: 1, createdAt: "2026-05-01T00:00:00Z" })];
        const server = ["2026-05", "2026-05", "bad"];
        expect(buildMonthOptions(rows, server)).toEqual(["2026-05"]);
    });
});

describe("formatMonthLabel", () => {
    it("renders English label with ASCII digits", () => {
        const months: Record<string, string> = { "01": "January", "05": "May", "12": "December" };
        const out = formatMonthLabel("2026-05", "en", (key) => months[key] ?? key);
        expect(out).toBe("May 2026");
    });

    it("renders Persian label with Persian digits", () => {
        const months: Record<string, string> = { "05": "می" };
        const out = formatMonthLabel("2026-05", "fa", (key) => months[key] ?? key);
        expect(out).toContain("می");
        // Persian digits → ۲۰۲۶
        expect(out).toContain("۲۰۲۶");
    });

    it("passes through invalid input unchanged", () => {
        expect(formatMonthLabel("bad", "en", () => "?")).toBe("bad");
    });
});

describe("formatFileSize", () => {
    it("formats bytes / KB / MB / GB with one decimal where useful", () => {
        expect(formatFileSize(0, "en")).toBe("—");
        expect(formatFileSize(512, "en")).toBe("512 B");
        expect(formatFileSize(2048, "en")).toBe("2.0 KB");
        expect(formatFileSize(3 * 1024 * 1024, "en")).toBe("3.0 MB");
    });

    it("drops the decimal once the value exceeds 100 in its unit", () => {
        expect(formatFileSize(150 * 1024, "en")).toBe("150 KB");
    });

    it("returns the em-dash for null", () => {
        expect(formatFileSize(null, "en")).toBe("—");
    });
});

function mockRow(overrides: Partial<{ id: number; createdAt: string }>) {
    return {
        id: overrides.id ?? 1,
        kind: "image" as const,
        url: "https://example.com/x.jpg",
        filename: "x.jpg",
        title: null,
        alt: null,
        caption: null,
        description: null,
        mime: "image/jpeg",
        width: null,
        height: null,
        variants: null,
        sizeBytes: null,
        uploadedByUserId: null,
        createdAt: overrides.createdAt ?? null,
        updatedAt: null,
    };
}
