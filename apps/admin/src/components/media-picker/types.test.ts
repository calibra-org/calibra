import { describe, expect, it } from "vitest";

import type { AdminMedia } from "#/lib/types";

import { hasSelection, selectionFromValue, selectionToRows, toggleSelection } from "./types";

function mockRow(id: number, overrides: Partial<AdminMedia> = {}): AdminMedia {
    return {
        id,
        kind: "image",
        url: `https://example.com/${id}.jpg`,
        filename: `${id}.jpg`,
        title: null,
        alt: null,
        caption: null,
        description: null,
        mime: "image/jpeg",
        width: null,
        height: null,
        sizeBytes: null,
        uploadedByUserId: null,
        createdAt: null,
        updatedAt: null,
        ...overrides,
    };
}

describe("toggleSelection — single mode", () => {
    it("replaces an empty selection with the tapped id", () => {
        expect(toggleSelection([], 7, "single")).toEqual([7]);
    });

    it("clears the selection when the same id is tapped again", () => {
        expect(toggleSelection([7], 7, "single")).toEqual([]);
    });

    it("swaps to the tapped id when a different id was selected", () => {
        expect(toggleSelection([7], 9, "single")).toEqual([9]);
    });

    it("only honours the first selected id, never accumulating", () => {
        expect(toggleSelection([3], 4, "single")).toEqual([4]);
    });
});

describe("toggleSelection — multiple mode", () => {
    it("adds an id to an empty selection", () => {
        expect(toggleSelection([], 1, "multiple")).toEqual([1]);
    });

    it("appends new ids to preserve selection order", () => {
        expect(toggleSelection([1, 2], 3, "multiple")).toEqual([1, 2, 3]);
    });

    it("removes an id that was already selected", () => {
        expect(toggleSelection([1, 2, 3], 2, "multiple")).toEqual([1, 3]);
    });

    it("is a no-op when removing the only selected id is requested twice", () => {
        const once = toggleSelection([5], 5, "multiple");
        expect(once).toEqual([]);
        expect(toggleSelection(once, 5, "multiple")).toEqual([5]);
    });
});

describe("hasSelection", () => {
    it("is false on an empty selection", () => {
        expect(hasSelection([])).toBe(false);
    });

    it("is true once one id is present", () => {
        expect(hasSelection([42])).toBe(true);
    });
});

describe("selectionFromValue", () => {
    it("returns an empty array for null/undefined", () => {
        expect(selectionFromValue(null)).toEqual([]);
        expect(selectionFromValue(undefined)).toEqual([]);
    });

    it("wraps a single id in an array", () => {
        expect(selectionFromValue(11)).toEqual([11]);
    });

    it("clones array inputs so callers don't mutate the source", () => {
        const source = [1, 2];
        const out = selectionFromValue(source);
        expect(out).toEqual([1, 2]);
        out.push(3);
        expect(source).toEqual([1, 2]);
    });
});

describe("selectionToRows", () => {
    it("returns rows in the selection order, not the pool order", () => {
        const pool = [mockRow(1), mockRow(2), mockRow(3)];
        const out = selectionToRows([3, 1], pool);
        expect(out.map((r) => r.id)).toEqual([3, 1]);
    });

    it("silently drops ids that the pool doesn't carry", () => {
        const pool = [mockRow(1), mockRow(2)];
        const out = selectionToRows([1, 99, 2], pool);
        expect(out.map((r) => r.id)).toEqual([1, 2]);
    });

    it("returns an empty array on an empty selection", () => {
        expect(selectionToRows([], [mockRow(1)])).toEqual([]);
    });
});
