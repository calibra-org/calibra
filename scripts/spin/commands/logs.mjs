// @ts-check

import { join } from "node:path";

import { requireSlug } from "../flags.mjs";
import { readMetaOrFail } from "../meta.mjs";

/**
 * `pnpm spin logs <slug> [--service <name>]` — print the absolute path to the log file an
 * agent should `tail -f`. Defaults to the api ndjson stream (most useful for investigation —
 * it's structured + level-tagged). Service names: `api.ndjson` (default), `api`, `admin`,
 * `web`, `queue`, `agent`. Prints the path only; the agent picks how to consume it (`tail`,
 * `less`, `jq`, …) so spin doesn't have to model every workflow.
 *
 * @param {string[]} args
 */
export async function logs(args) {
    const slug = requireSlug(args[0]);
    const rest = args.slice(1);
    const idx = rest.indexOf("--service");
    const requested = (idx >= 0 ? rest[idx + 1] : rest[0]) ?? "api.ndjson";
    const allowed = new Set(["api.ndjson", "api", "admin", "web", "queue", "agent"]);
    if (!allowed.has(requested)) {
        throw new Error(`unknown log stream "${requested}". Recognised: ${[...allowed].join(", ")}`);
    }
    const meta = await readMetaOrFail(slug);
    const path =
        requested === "api.ndjson"
            ? join(meta.worktreePath, ".spin/logs/api.ndjson")
            : join(meta.worktreePath, `.spin/logs/${requested}.log`);
    process.stdout.write(`${path}\n`);
}
