"use client";

/**
 * Client-side trash bookkeeping for reviews. The API only knows three states
 * (`pending` / `approved` / `rejected`) and exposes a single hard-delete endpoint, but the
 * WordPress-style admin distinguishes Spam from Trash. We bridge the gap by tracking trashed
 * review ids in `localStorage` and excluding them from the visible Spam/Approved/Pending tabs.
 *
 * TODO(api): replace this with a real soft-delete flow once `apps/api` ships a `trashed` field
 * and a restore endpoint. The keys and helpers here are intentionally narrow so the swap is a
 * one-file deletion.
 */

const STORAGE_KEY = "admin.reviews.trash.v1";

type Listener = () => void;
const listeners = new Set<Listener>();

let cache: Set<number> | undefined;

function read(): Set<number> {
    if (typeof window === "undefined") return new Set();
    if (cache !== undefined) return cache;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const parsed = raw === null ? [] : (JSON.parse(raw) as unknown);
        const ids = Array.isArray(parsed) ? parsed.filter((value): value is number => Number.isFinite(value)) : [];
        cache = new Set(ids);
    } catch {
        cache = new Set();
    }
    return cache;
}

function write(next: Set<number>) {
    cache = next;
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
    } catch {
        /** ignored — quota / private mode. */
    }
    for (const listener of listeners) listener();
}

export function loadTrashedIds(): Set<number> {
    return new Set(read());
}

export function isTrashed(id: number): boolean {
    return read().has(id);
}

export function moveToTrash(ids: number[]): void {
    const next = new Set(read());
    for (const id of ids) next.add(id);
    write(next);
}

export function restoreFromTrash(ids: number[]): void {
    const next = new Set(read());
    for (const id of ids) next.delete(id);
    write(next);
}

export function purgeFromTrash(ids: number[]): void {
    restoreFromTrash(ids);
}

export function subscribeToTrash(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
