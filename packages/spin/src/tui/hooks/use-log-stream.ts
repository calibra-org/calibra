import { join } from "node:path";
import { useEffect, useRef, useState } from "react";

import { serviceById } from "../../core/catalog";
import { buildComposeOptions } from "../../core/compose-assembly";
import { hostLogFile } from "../../core/host-process";
import { type LogStream, readServiceLogTail, streamContainerLog, streamHostLog } from "../../core/log-stream";
import type { SpinMeta } from "../../core/meta";
import { spinLogDir } from "../../core/paths";

/**
 * Tail a service's log inside the TUI with a bounded ring buffer and a 250ms batched flush (so a
 * chatty log doesn't re-render the pane on every line). Re-subscribes when `name` or the sandbox
 * changes; stops the stream on cleanup.
 */
export function useLogStream(meta: SpinMeta | null, name: string | null, cap = 5000): string[] {
    const [lines, setLines] = useState<string[]>([]);
    const bufferRef = useRef<string[]>([]);

    useEffect(() => {
        if (!meta || !name) {
            setLines([]);
            return;
        }
        bufferRef.current = [];
        setLines([]);

        const push = (line: string) => {
            bufferRef.current.push(line);
        };

        let stream: LogStream | null = null;
        void (async () => {
            const tail = await readServiceLogTail(resolveHostPath(meta, name), 200);
            if (tail.length) bufferRef.current.push(...tail);
            stream = startStream(meta, name, push);
        })();

        const flush = setInterval(() => {
            if (bufferRef.current.length === 0) return;
            setLines((prev) => {
                const merged = prev.concat(bufferRef.current);
                bufferRef.current = [];
                return merged.length > cap ? merged.slice(merged.length - cap) : merged;
            });
        }, 250);

        return () => {
            clearInterval(flush);
            stream?.stop();
        };
    }, [meta, name, cap]);

    return lines;
}

function resolveHostPath(meta: SpinMeta, name: string): string {
    if (name === "api.ndjson") return join(spinLogDir(meta.worktreePath), "api.ndjson");
    return hostLogFile(meta.worktreePath, name);
}

function startStream(meta: SpinMeta, name: string, onLine: (line: string) => void): LogStream | null {
    if (name === "api.ndjson") return streamHostLog(join(spinLogDir(meta.worktreePath), "api.ndjson"), onLine);
    const service = serviceById(name);
    if (!service) return null;
    if (service.kind === "host") return streamHostLog(hostLogFile(meta.worktreePath, name), onLine);
    if (service.composeService) return streamContainerLog(buildComposeOptions(meta), service.composeService, onLine);
    return null;
}
