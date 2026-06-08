import { useCallback, useEffect, useRef, useState } from "react";

import type { SandboxSnapshot } from "./types";

/**
 * Panel data hooks. All client-only — they talk to the agent server over fetch + EventSource. No
 * node imports (this file is in the browser bundle).
 */

/** Poll `/api/status` every `intervalMs`, plus an immediate refetch when the tab regains focus. */
export function useStatus(intervalMs = 3000): { snapshot: SandboxSnapshot | null; error: string | null; refresh: () => void } {
    const [snapshot, setSnapshot] = useState<SandboxSnapshot | null>(null);
    const [error, setError] = useState<string | null>(null);
    const inFlight = useRef(false);

    const refresh = useCallback(async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        try {
            const response = await fetch("/api/status");
            if (!response.ok) throw new Error(`status ${response.status}`);
            setSnapshot((await response.json()) as SandboxSnapshot);
            setError(null);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            inFlight.current = false;
        }
    }, []);

    useEffect(() => {
        void refresh();
        const timer = setInterval(() => void refresh(), intervalMs);
        const onFocus = () => void refresh();
        window.addEventListener("focus", onFocus);
        return () => {
            clearInterval(timer);
            window.removeEventListener("focus", onFocus);
        };
    }, [refresh, intervalMs]);

    return { snapshot, error, refresh };
}

/** Subscribe to a service's SSE log stream, keeping a bounded ring of the last `cap` lines. */
export function useLogStream(name: string | null, cap = 5000): { lines: string[]; clear: () => void } {
    const [lines, setLines] = useState<string[]>([]);
    const clear = useCallback(() => setLines([]), []);

    useEffect(() => {
        if (!name) return;
        setLines([]);
        const source = new EventSource(`/api/log/${encodeURIComponent(name)}/stream`);
        source.addEventListener("line", (event) => {
            const line = JSON.parse((event as MessageEvent).data) as string;
            setLines((prev) => {
                const next = prev.length >= cap ? prev.slice(prev.length - cap + 1) : prev.slice();
                next.push(line);
                return next;
            });
        });
        source.addEventListener("done", () => source.close());
        return () => source.close();
    }, [name, cap]);

    return { lines, clear };
}

export interface ActionState {
    running: boolean;
    lines: string[];
    done: boolean;
    ok: boolean | null;
}

/** Run a POST action and read its SSE output stream (restart/reseed/migrate). */
export function useAction(): { state: ActionState; run: (action: string, service?: string) => void; reset: () => void } {
    const [state, setState] = useState<ActionState>({ running: false, lines: [], done: false, ok: null });
    const reset = useCallback(() => setState({ running: false, lines: [], done: false, ok: null }), []);

    const run = useCallback((action: string, service?: string) => {
        setState({ running: true, lines: [], done: false, ok: null });
        /** Actions are POST (they mutate), so we read the SSE stream from the fetch body, not EventSource. */
        const query = service ? `?service=${encodeURIComponent(service)}` : "";
        void streamAction(action, query, setState);
    }, []);

    return { state, run, reset };
}

async function streamAction(
    action: string,
    query: string,
    setState: (updater: (prev: ActionState) => ActionState) => void,
): Promise<void> {
    try {
        const response = await fetch(`/api/actions/${action}${query}`, { method: "POST" });
        if (!response.body) throw new Error(`action ${action} returned no stream`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";
            for (const block of events) handleSseBlock(block, setState);
        }
        setState((prev) => (prev.done ? prev : { ...prev, running: false, done: true, ok: prev.ok ?? true }));
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setState((prev) => ({ ...prev, running: false, done: true, ok: false, lines: [...prev.lines, message] }));
    }
}

function handleSseBlock(block: string, setState: (updater: (prev: ActionState) => ActionState) => void): void {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) return;
    if (event === "line") {
        const text = JSON.parse(data) as string;
        setState((prev) => ({ ...prev, lines: [...prev.lines, text] }));
    } else if (event === "done") {
        const payload = JSON.parse(data) as { ok: boolean };
        setState((prev) => ({ ...prev, running: false, done: true, ok: payload.ok }));
    }
}
