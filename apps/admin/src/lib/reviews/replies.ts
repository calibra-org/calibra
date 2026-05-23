"use client";

/**
 * Client-side store for admin replies to reviews. WordPress lets the moderator post a public
 * reply that threads under the original review; our API has no equivalent yet, so the reply text
 * lives in `localStorage` until the backend lands.
 *
 * TODO(api): persist replies via a dedicated endpoint (`POST /admin/reviews/{id}/reply` or a
 * `reply` column on the review row). This module is intentionally tiny so the swap is local.
 */

const STORAGE_KEY = "admin.reviews.replies.v1";

interface ReplyRecord {
    body: string;
    updatedAt: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

let cache: Record<string, ReplyRecord> | undefined;

function read(): Record<string, ReplyRecord> {
    if (typeof window === "undefined") return {};
    if (cache !== undefined) return cache;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        cache = raw === null ? {} : (JSON.parse(raw) as Record<string, ReplyRecord>);
    } catch {
        cache = {};
    }
    return cache;
}

function write(next: Record<string, ReplyRecord>) {
    cache = next;
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        /** ignored — quota / private mode. */
    }
    for (const listener of listeners) listener();
}

export function loadReplies(): Record<number, ReplyRecord> {
    const data = read();
    const out: Record<number, ReplyRecord> = {};
    for (const [key, value] of Object.entries(data)) {
        const id = Number(key);
        if (Number.isFinite(id)) out[id] = value;
    }
    return out;
}

export function getReply(id: number): ReplyRecord | undefined {
    return read()[String(id)];
}

export function saveReply(id: number, body: string): void {
    const next = { ...read() };
    const trimmed = body.trim();
    if (trimmed.length === 0) {
        delete next[String(id)];
    } else {
        next[String(id)] = { body: trimmed, updatedAt: new Date().toISOString() };
    }
    write(next);
}

export function deleteReply(id: number): void {
    const next = { ...read() };
    delete next[String(id)];
    write(next);
}

export function subscribeToReplies(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
