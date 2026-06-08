import { join } from "node:path";
import type { Command } from "commander";
import { readMetaOrFail } from "../core/meta";
import { readServiceLogTail, streamHostLog } from "../core/log-stream";
import { spinLogDir } from "../core/paths";

/**
 * Print the absolute path to a host log file (the agent-friendly default — the caller picks
 * `tail`/`jq`/`less`), or stream it with `-f`. `api.ndjson` is the structured api stream; the
 * rest are the `<service>.log` host-process files.
 */
const STREAMS = new Set(["api.ndjson", "api", "admin", "web", "platform", "queue", "agent"]);

function logPath(worktreePath: string, stream: string): string {
    if (stream === "api.ndjson") return join(spinLogDir(worktreePath), "api.ndjson");
    return join(spinLogDir(worktreePath), `${stream}.log`);
}

export async function runLogs(slug: string, stream: string, opts: { follow?: boolean; tail?: string }): Promise<void> {
    if (!STREAMS.has(stream)) {
        throw new Error(`unknown log stream "${stream}". Recognised: ${[...STREAMS].join(", ")}`);
    }
    const meta = await readMetaOrFail(slug);
    const path = logPath(meta.worktreePath, stream);

    if (!opts.follow) {
        process.stdout.write(`${path}\n`);
        return;
    }

    const tail = Number.parseInt(opts.tail ?? "200", 10);
    for (const line of await readServiceLogTail(path, Number.isFinite(tail) ? tail : 200)) {
        process.stdout.write(`${line}\n`);
    }
    const handle = streamHostLog(path, (line) => process.stdout.write(`${line}\n`));
    process.on("SIGINT", () => {
        handle.stop();
        process.exit(0);
    });
}

export function registerLogs(program: Command): void {
    program
        .command("logs")
        .argument("<slug>", "sandbox slug")
        .argument("[stream]", "api.ndjson | api | admin | web | platform | queue | agent", "api.ndjson")
        .description("print a host log path (default) or stream it with -f")
        .option("-f, --follow", "tail and follow the log")
        .option("--tail <n>", "lines to print before following", "200")
        .action(async (slug: string, stream: string, opts: { follow?: boolean; tail?: string }) => {
            await runLogs(slug, stream, opts);
        });
}
