import { describe, expect, it } from "vitest";

import { DEFAULT_LIMIT_OPTIONS, emptyPaginationMeta, isAllVisibleSelected, parseSort, serializeSort } from "./use-data-table";

describe("parseSort / serializeSort", () => {
    it("parses an empty URL value as undefined", () => {
        expect(parseSort(null)).toBeUndefined();
        expect(parseSort("")).toBeUndefined();
    });

    it("parses ascending sort", () => {
        expect(parseSort("name")).toEqual({ id: "name", direction: "asc" });
    });

    it("parses descending sort", () => {
        expect(parseSort("-price")).toEqual({ id: "price", direction: "desc" });
    });

    it("serializes undefined to empty string", () => {
        expect(serializeSort(undefined)).toBe("");
    });

    it("round-trips ascending sort", () => {
        expect(serializeSort({ id: "name", direction: "asc" })).toBe("name");
        expect(parseSort("name")).toEqual({ id: "name", direction: "asc" });
    });

    it("round-trips descending sort", () => {
        expect(serializeSort({ id: "stock", direction: "desc" })).toBe("-stock");
        expect(parseSort("-stock")).toEqual({ id: "stock", direction: "desc" });
    });
});

describe("isAllVisibleSelected", () => {
    const getId = (row: { id: number }) => String(row.id);
    const visible = [{ id: 1 }, { id: 2 }, { id: 3 }];

    it("returns 'none' when there are no rows", () => {
        expect(isAllVisibleSelected([], getId, new Set())).toBe("none");
    });

    it("returns 'none' when nothing is selected", () => {
        expect(isAllVisibleSelected(visible, getId, new Set())).toBe("none");
    });

    it("returns 'some' when a subset is selected", () => {
        expect(isAllVisibleSelected(visible, getId, new Set(["1"]))).toBe("some");
    });

    it("returns 'all' when every visible row is selected", () => {
        expect(isAllVisibleSelected(visible, getId, new Set(["1", "2", "3"]))).toBe("all");
    });

    it("ignores selected ids not present on the visible page (selection across pages)", () => {
        expect(isAllVisibleSelected(visible, getId, new Set(["1", "2", "3", "99"]))).toBe("all");
    });
});

describe("emptyPaginationMeta", () => {
    it("uses the supplied limit value", () => {
        const meta = emptyPaginationMeta(50);
        expect(meta.limit).toBe(50);
        expect(meta.total).toBe(0);
        expect(meta.lastPage).toBe(1);
        expect(meta.page).toBe(1);
    });
});

describe("DEFAULT_LIMIT_OPTIONS", () => {
    it("starts at 10 and includes a 100-row option", () => {
        expect(DEFAULT_LIMIT_OPTIONS[0]).toBe(10);
        expect(DEFAULT_LIMIT_OPTIONS).toContain(100);
    });
});
