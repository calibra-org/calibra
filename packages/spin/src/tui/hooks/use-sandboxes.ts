import { useEffect, useState } from "react";

import { listMeta } from "../../core/meta";
import { isPortListening } from "../../core/probes";
import { runActivity } from "../../core/run-state";

export interface SandboxRow {
    slug: string;
    branch: string;
    api: number;
    admin: number;
    status: "running" | "partial" | "stopped" | "starting" | "interrupted" | "failed";
}

/** Poll the inventory of all spins (cheap: meta + api/admin port probe + run-state) every interval. */
export function useSandboxes(intervalMs = 3000): SandboxRow[] {
    const [rows, setRows] = useState<SandboxRow[]>([]);

    useEffect(() => {
        let active = true;
        async function tick(): Promise<void> {
            const metas = await listMeta();
            const next = await Promise.all(
                metas.map(async (meta): Promise<SandboxRow> => {
                    const [apiUp, adminUp, activity] = await Promise.all([
                        isPortListening(meta.ports.api),
                        isPortListening(meta.ports.admin),
                        runActivity(meta.slug),
                    ]);
                    let status: SandboxRow["status"] = apiUp && adminUp ? "running" : apiUp || adminUp ? "partial" : "stopped";
                    if (activity.kind === "in-progress") status = "starting";
                    else if (activity.kind === "interrupted") status = "interrupted";
                    else if (activity.kind === "failed") status = "failed";
                    return { slug: meta.slug, branch: meta.branch, api: meta.ports.api, admin: meta.ports.admin, status };
                }),
            );
            if (active) setRows(next);
        }
        void tick();
        const timer = setInterval(() => void tick(), intervalMs);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [intervalMs]);

    return rows;
}
