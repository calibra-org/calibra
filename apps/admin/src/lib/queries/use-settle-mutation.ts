"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SettleMutationOptions<TValue, TResult> {
    /**
     * The value already committed to the server. The hook syncs to this whenever the user is
     * idle (no pending input + nothing in flight), so server refetches land cleanly.
     */
    committedValue: TValue;
    /** Equality check between two values; defaults to `Object.is`. */
    equals?: (a: TValue, b: TValue) => boolean;
    /** Network call. Receives the value the user settled on. */
    mutate: (value: TValue) => Promise<TResult>;
    /**
     * Quiet window before the value is considered "settled" and the network call fires. Each
     * `setPending` call resets the timer. Defaults to 1200ms — long enough to absorb a rapid
     * toggle-on-then-off, short enough that the operator feels the save is responsive.
     */
    delayMs?: number;
}

export interface SettleMutationReturn<TValue> {
    /** What the operator currently sees — optimistic, may differ from `committedValue`. */
    pending: TValue;
    /** True between `setPending` and the settle timer firing. */
    isDebouncing: boolean;
    /** True while the network call is in flight. */
    isSaving: boolean;
    /** Optimistically update the value and restart the settle timer. */
    setPending: (next: TValue) => void;
    /** Force the settle now — e.g. on blur, on unmount, or when an explicit "Save" lands. */
    flush: () => Promise<void>;
}

/**
 * Settle-then-persist mutation pattern.
 *
 * Use this for inputs that the operator manipulates conversationally — toggles, sliders, status
 * dropdowns — where every keystroke or click shouldn't translate to a database write. The hook:
 *
 *   1. Renders the operator's input immediately (`pending`) so the UI feels instant.
 *   2. Defers the network call until they've been idle for `delayMs` (default 1200ms).
 *   3. Compares the final value against `committedValue` and short-circuits when they match — so
 *      toggling on→off→on within the window writes zero history rows, not three.
 *
 * Pair it with a backend that no-ops when the new value equals the current value (no history /
 * audit write on same-value PATCHes). The frontend collapses noise across the window; the backend
 * collapses noise across separate requests. Both layers are needed for a clean audit trail.
 *
 * See [`AGENTS.md` § Settle-then-persist mutations](/AGENTS.md) for when to reach for this and
 * when discrete writes (Save buttons, explicit submit) are the right shape instead.
 */
export function useSettleMutation<TValue, TResult>({
    committedValue,
    equals = Object.is,
    mutate,
    delayMs = 1200,
}: SettleMutationOptions<TValue, TResult>): SettleMutationReturn<TValue> {
    const [pending, setPendingState] = useState<TValue>(committedValue);
    const [isDebouncing, setDebouncing] = useState(false);
    const [isSaving, setSaving] = useState(false);

    /**
     * The latest server-known value. Updated by the parent (server refetches, query
     * invalidations) and by `flush` on successful save. Kept in a ref so the flush closure can
     * always compare against the most recent commit without re-creating itself per render.
     */
    const committedRef = useRef<TValue>(committedValue);
    /** Latest pending value, kept in a ref so the timer callback reads the most recent edit. */
    const pendingRef = useRef<TValue>(committedValue);
    const timerRef = useRef<number | null>(null);
    const equalsRef = useRef(equals);
    const mutateRef = useRef(mutate);

    useEffect(() => {
        equalsRef.current = equals;
        mutateRef.current = mutate;
    }, [equals, mutate]);

    /**
     * Whenever the upstream `committedValue` changes (server refetch landed, peer edit synced),
     * advance our committed snapshot. Only mirror it into `pending` when the operator is idle —
     * otherwise we'd stomp their in-flight typing.
     */
    useEffect(() => {
        committedRef.current = committedValue;
        if (!isDebouncing && !isSaving) {
            pendingRef.current = committedValue;
            setPendingState(committedValue);
        }
    }, [committedValue, isDebouncing, isSaving]);

    const flush = useCallback(async () => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setDebouncing(false);

        const target = pendingRef.current;
        if (equalsRef.current(target, committedRef.current)) return;

        setSaving(true);
        try {
            await mutateRef.current(target);
            committedRef.current = target;
        } finally {
            setSaving(false);
        }
    }, []);

    const setPending = useCallback(
        (next: TValue) => {
            pendingRef.current = next;
            setPendingState(next);
            setDebouncing(true);
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => {
                timerRef.current = null;
                flush();
            }, delayMs);
        },
        [delayMs, flush],
    );

    useEffect(
        () => () => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                /**
                 * Don't auto-flush on unmount — the parent decides whether an in-flight edit
                 * should be persisted or discarded (a dialog close, route change, etc.). Callers
                 * that DO want a save-on-unmount can call `flush()` explicitly from their own
                 * cleanup effect.
                 */
            }
        },
        [],
    );

    return { pending, isDebouncing, isSaving, setPending, flush };
}
