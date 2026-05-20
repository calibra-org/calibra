"use client";

/**
 * TODO(api): the AdonisJS admin doesn't yet expose a favorite flag on `AdminProduct` nor a
 * `PATCH /products/{id}/favorite` endpoint. Until it does, favorites live in `localStorage` so
 * the UX is fully functional; replace this with a real round-trip when the API ships the field
 * (the optimistic-update path in `useToggleFavorite` is already wired to swap in cleanly).
 */

const STORAGE_KEY = "admin.products.favorites";

function readSet(): Set<number> {
    if (typeof window === "undefined") return new Set();
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return new Set();
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter((value): value is number => typeof value === "number"));
    } catch {
        return new Set();
    }
}

function writeSet(values: Set<number>): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(values)));
    } catch {
        /** ignore quota / private-mode failures. */
    }
}

export function loadFavorites(): Set<number> {
    return readSet();
}

export function saveFavorites(values: Set<number>): void {
    writeSet(new Set(values));
}

export function toggleFavorite(id: number, current: Set<number>): Set<number> {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    writeSet(next);
    return next;
}
