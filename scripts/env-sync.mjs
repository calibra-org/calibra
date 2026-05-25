#!/usr/bin/env node
// @ts-check
/**
 * `pnpm env-sync` (called from `just env-sync`).
 *
 * Walks each app's `.env.example` (or `.env.example.local`) and ensures the runtime `.env` file
 * exists. Two phases:
 *
 *   1. **Copy when missing** — on a fresh checkout the runtime file doesn't exist yet; this is
 *      a one-time copy so `pnpm dev` / `node ace migration:run` find every validated env key.
 *      We don't overwrite existing files; operators may have edited them.
 *
 *   2. **Warn on drift** — once a runtime file exists, diff its keys against the example. Any
 *      keys present in the example but not in the runtime file are flagged. We don't auto-merge
 *      because the operator may have intentionally removed a key (e.g. switching `CACHE_DRIVER`
 *      to `memory` and dropping the redis vars); printing a clear "add this line to apps/x/.env"
 *      is friendlier than a silent merge.
 *
 * Exits 0 always — drift warnings never block boot. The validator in `apps/api/start/env.ts`
 * is the real gate; this script just makes the failure recoverable in one command.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

const TARGETS = [
    { runtime: "apps/api/.env", example: "apps/api/.env.example" },
    { runtime: "apps/web/.env.local", example: "apps/web/.env.example" },
    { runtime: "apps/admin/.env.local", example: "apps/admin/.env.example" },
];

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

/** Parse `KEY=value` lines, ignoring blanks + `#` comments. Returns the set of keys. */
function envKeys(path) {
    if (!existsSync(path)) return new Set();
    const keys = new Set();
    const body = readFileSync(path, "utf8");
    for (const raw of body.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        keys.add(line.slice(0, eq).trim());
    }
    return keys;
}

let warnings = 0;
for (const { runtime, example } of TARGETS) {
    const runtimePath = resolve(REPO_ROOT, runtime);
    const examplePath = resolve(REPO_ROOT, example);
    if (!existsSync(examplePath)) {
        console.warn(`${YELLOW}env-sync: skipping ${runtime} — no ${example} found${RESET}`);
        continue;
    }
    if (!existsSync(runtimePath)) {
        const body = readFileSync(examplePath, "utf8");
        writeFileSync(runtimePath, body);
        console.log(`${GREEN}env-sync: created${RESET} ${runtime} ${DIM}(copied from ${example})${RESET}`);
        continue;
    }
    const runtimeKeys = envKeys(runtimePath);
    const exampleKeys = envKeys(examplePath);
    const missing = [...exampleKeys].filter((k) => !runtimeKeys.has(k));
    if (missing.length === 0) {
        console.log(`${DIM}env-sync: ${runtime} in sync (${exampleKeys.size} keys)${RESET}`);
        continue;
    }
    warnings += 1;
    console.warn(
        `${YELLOW}env-sync: ${runtime} is missing ${missing.length} key${missing.length === 1 ? "" : "s"} present in ${example}:${RESET}`,
    );
    for (const key of missing) console.warn(`  - ${CYAN}${key}${RESET}`);
    console.warn(
        `${DIM}  → copy the matching lines from ${example} into ${runtime} (or delete ${runtime} and re-run env-sync to start fresh).${RESET}`,
    );
}

if (warnings > 0) {
    console.warn(
        `\n${RED}env-sync: ${warnings} file${warnings === 1 ? " is" : "s are"} drifted from the .env.example template.${RESET}`,
    );
    console.warn(`${DIM}env validation in apps/api/start/env.ts will block boot until every required key is present.${RESET}`);
}
