import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import type { ComposeOptions } from "./compose";

/**
 * Log streaming for host-process log files and container logs. The host streamer uses
 * `fs.watch` **plus a 1s poll backstop** because `fs.watch` silently drops events on WSL2 +
 * bind-mounts (the project's environment), tracks a byte offset to resume without re-reading, and
 * resets to 0 on truncation/rotation (a restart truncates the log). Consumed by `logs -f`, the
 * panel's SSE feed, and the TUI's log pane.
 */

const ANSI_RE = /[][[\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><])/g;

/** Strip ANSI escape sequences. Host processes run with NO_COLOR, but this catches stragglers. */
export function stripAnsi(value: string): string {
    return value.replace(ANSI_RE, "");
}

/** Read the last `lines` lines of a log file (ANSI-stripped). Returns [] if the file is absent. */
export async function readServiceLogTail(path: string, lines = 200): Promise<string[]> {
    if (!existsSync(path)) return [];
    const content = await readFile(path, "utf8");
    const all = content.split("\n");
    if (all.length > 0 && all[all.length - 1] === "") all.pop();
    return all.slice(-lines).map(stripAnsi);
}

export interface LogStream {
    stop: () => void;
}

/**
 * Stream a host-process log file line-by-line. Starts at the current end (tail behaviour) unless
 * `fromStart` is set. Partial trailing lines are buffered until their newline arrives.
 */
export function streamHostLog(
    path: string,
    onLine: (line: string) => void,
    opts: { fromStart?: boolean } = {},
): LogStream {
    let offset = 0;
    let buffer = "";
    let closed = false;
    let pumping = false;

    try {
        if (existsSync(path)) offset = opts.fromStart ? 0 : statSync(path).size;
    } catch {
        offset = 0;
    }

    async function pump(): Promise<void> {
        if (closed || pumping) return;
        pumping = true;
        try {
            if (!existsSync(path)) return;
            const size = statSync(path).size;
            if (size < offset) {
                /** File truncated/rotated (a restart) — replay from the top. */
                offset = 0;
                buffer = "";
            }
            if (size > offset) {
                const stream = createReadStream(path, { start: offset, end: size - 1, encoding: "utf8" });
                let chunk = "";
                for await (const part of stream) chunk += part;
                offset = size;
                buffer += chunk;
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) onLine(stripAnsi(line));
            }
        } catch {
            /* transient read error — the poll backstop retries */
        } finally {
            pumping = false;
        }
    }

    let watcher: ReturnType<typeof watch> | undefined;
    try {
        watcher = watch(path, () => void pump());
    } catch {
        /* file may not exist yet — the poll backstop covers it */
    }
    const interval = setInterval(() => void pump(), 1000);
    if (opts.fromStart) void pump();

    return {
        stop() {
            closed = true;
            clearInterval(interval);
            try {
                watcher?.close();
            } catch {
                /* ignore */
            }
        },
    };
}

/** Stream a container's logs via `docker compose logs -f`. */
export function streamContainerLog(
    compose: ComposeOptions,
    service: string,
    onLine: (line: string) => void,
    tail = 200,
): LogStream {
    const args = ["compose", "-p", compose.project];
    for (const file of compose.files) args.push("-f", file);
    args.push("logs", "-f", "--no-color", "--tail", String(tail), service);

    const child = spawn("docker", args, { env: compose.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
    let buffer = "";
    const handle = (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) onLine(stripAnsi(line));
    };
    child.stdout?.on("data", handle);
    child.stderr?.on("data", handle);

    return {
        stop() {
            try {
                child.kill("SIGTERM");
            } catch {
                /* ignore */
            }
        },
    };
}
