import { useEffect, useRef, useState } from "react";
import type { SpinMeta } from "../../core/meta";
import { buildSnapshot } from "../../core/snapshot";
import type { SandboxSnapshot } from "../../core/snapshot-types";

/**
 * Poll {@link buildSnapshot} for the active sandbox every `intervalMs`. The TUI runs in the spin
 * process, so this calls the builder directly (no HTTP). An `inFlight` guard prevents overlapping
 * probe rounds; the last good snapshot is retained while a refresh is in flight.
 */
export function useSnapshot(meta: SpinMeta | null, intervalMs = 2000): SandboxSnapshot | null {
    const [snapshot, setSnapshot] = useState<SandboxSnapshot | null>(null);
    const inFlight = useRef(false);

    useEffect(() => {
        if (!meta) {
            setSnapshot(null);
            return;
        }
        let active = true;
        async function tick(): Promise<void> {
            if (inFlight.current) return;
            inFlight.current = true;
            try {
                const next = await buildSnapshot(meta as SpinMeta);
                if (active) setSnapshot(next);
            } catch {
                /* keep the last good snapshot */
            } finally {
                inFlight.current = false;
            }
        }
        void tick();
        const timer = setInterval(() => void tick(), intervalMs);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [meta, intervalMs]);

    return snapshot;
}
