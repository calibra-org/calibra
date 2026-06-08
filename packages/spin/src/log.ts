import { c } from "./colors";

/**
 * Minimal leveled logger for the spin CLI. We deliberately avoid `pino`/`pino-pretty`:
 * the spin tool's logging needs are a handful of human-readable progress lines, not a
 * structured-logging pipeline.
 *
 * Every log line is written to **stderr** so that command *data* (JSON payloads, URLs,
 * file paths) can own stdout uncontaminated — this is what lets `spin doctor --json | jq`
 * and `spin url … | xargs open` work. {@link setJsonMode} additionally silences
 * non-error chatter so `--json` output stays byte-clean even on the progress channel.
 */

type Fields = Record<string, unknown>;

let quiet = false;
const debugEnabled = (process.env.SPIN_LOG_LEVEL ?? "info").toLowerCase() === "debug";

/**
 * Suppress info/step/success/skip/debug lines. Called by every `--json` command so the
 * structured payload on stdout is never interleaved with human progress text. Warnings
 * and errors are always emitted (to stderr) regardless.
 */
export function setJsonMode(enabled: boolean): void {
    quiet = enabled;
}

function renderFields(fields?: Fields): string {
    if (!fields) return "";
    const parts = Object.entries(fields)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
    return parts.length ? ` ${c.dim(parts.join(" "))}` : "";
}

function line(badge: string, message: string, fields?: Fields): void {
    process.stderr.write(`${badge} ${message}${renderFields(fields)}\n`);
}

/** The shared logger instance. Levels map to a glyph + color, all on stderr. */
export const log = {
    info(message: string, fields?: Fields): void {
        if (!quiet) line(c.blue("ℹ"), message, fields);
    },
    step(message: string, fields?: Fields): void {
        if (!quiet) line(c.cyan("▶"), c.bold(message), fields);
    },
    success(message: string, fields?: Fields): void {
        if (!quiet) line(c.green("✓"), message, fields);
    },
    skip(message: string, fields?: Fields): void {
        if (!quiet) line(c.gray("○"), c.gray(message), fields);
    },
    warn(message: string, fields?: Fields): void {
        line(c.yellow("⚠"), message, fields);
    },
    error(message: string, fields?: Fields): void {
        line(c.red("✗"), message, fields);
    },
    debug(message: string, fields?: Fields): void {
        if (debugEnabled && !quiet) line(c.gray("·"), c.gray(message), fields);
    },
};
