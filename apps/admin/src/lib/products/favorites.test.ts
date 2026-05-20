import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadFavorites, saveFavorites, toggleFavorite } from "./favorites";

/**
 * Vitest 4 + jsdom requires `--localstorage-file` to enable persistence. We don't need disk
 * persistence here — a per-test in-memory shim is enough to round-trip the helpers.
 */
beforeAll(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
        value: {
            getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
            setItem: (key: string, value: string) => store.set(key, value),
            removeItem: (key: string) => store.delete(key),
            clear: () => store.clear(),
            key: (index: number) => Array.from(store.keys())[index] ?? null,
            get length() {
                return store.size;
            },
        },
        writable: true,
    });
});

beforeEach(() => {
    window.localStorage.clear();
});

describe("favorites storage", () => {
    it("starts empty", () => {
        expect(loadFavorites().size).toBe(0);
    });

    it("persists a saved set across reads", () => {
        saveFavorites(new Set([1, 2, 3]));
        expect(loadFavorites()).toEqual(new Set([1, 2, 3]));
    });

    it("toggle adds an id when missing", () => {
        const after = toggleFavorite(7, new Set([]));
        expect(after.has(7)).toBe(true);
    });

    it("toggle removes an id when present", () => {
        const after = toggleFavorite(7, new Set([7]));
        expect(after.has(7)).toBe(false);
    });

    it("toggle returns a new set instance, leaving the input untouched", () => {
        const before = new Set([1]);
        const after = toggleFavorite(2, before);
        expect(before).toEqual(new Set([1]));
        expect(after).toEqual(new Set([1, 2]));
    });

    it("ignores malformed storage entries", () => {
        window.localStorage.setItem("admin.products.favorites", "{not json");
        expect(loadFavorites().size).toBe(0);
    });

    it("skips non-numeric ids in storage", () => {
        window.localStorage.setItem("admin.products.favorites", JSON.stringify([1, "two", 3]));
        expect(loadFavorites()).toEqual(new Set([1, 3]));
    });
});
