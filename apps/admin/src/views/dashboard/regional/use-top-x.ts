"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * SSR-safe localStorage-backed "top X products" preference. Range is `[1, 10]`; default is `5`.
 * The hook reads after mount (so the first render always returns the default and never branches
 * on `typeof window`) and writes synchronously on every change.
 *
 * Key: `admin:regional:topProducts`.
 */

const STORAGE_KEY = "admin:regional:topProducts";
const MIN = 1;
const MAX = 10;
const DEFAULT = 5;

function clamp(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT;
    return Math.max(MIN, Math.min(MAX, Math.round(value)));
}

export function useTopX(): readonly [number, (next: number) => void] {
    const [value, setValue] = useState<number>(DEFAULT);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (raw === null) return;
            const parsed = Number(raw);
            if (Number.isFinite(parsed)) setValue(clamp(parsed));
        } catch {
            /** localStorage may be disabled (private browsing). Default stands. */
        }
    }, []);

    const update = useCallback((next: number) => {
        const clamped = clamp(next);
        setValue(clamped);
        try {
            window.localStorage.setItem(STORAGE_KEY, String(clamped));
        } catch {
            /** Ignore quota / disabled storage; the in-memory value already updated. */
        }
    }, []);

    return [value, update] as const;
}
