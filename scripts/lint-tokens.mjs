#!/usr/bin/env node
/**
 * Token-lint: ban raw Tailwind colour utilities outside `globals.css`.
 *
 * Forbidden: `text-red-600`, `bg-emerald-100`, `border-amber-500`, … (any colour-family + numeric step
 * combo). All code must use semantic tokens (`text-danger`, `bg-success`, `border-warning`, …).
 *
 * Why a standalone script: Biome v2 doesn't expose ESLint-style `no-restricted-syntax` against class
 * literals. This script walks the touched scope, prints offenders, and exits with the configured
 * severity. Wired into `pnpm lint` from the repo root.
 *
 * Usage:
 *   node scripts/lint-tokens.mjs --scope=apps/admin/src --level=warn
 *   node scripts/lint-tokens.mjs --scope=apps/admin/src --level=error   # used by prompt 06
 *
 * Exit codes:
 *   0  — no offenders (or level=warn and offenders printed as warnings)
 *   1  — level=error and offenders found
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const args = Object.fromEntries(
    process.argv
        .slice(2)
        .filter((a) => a.startsWith("--"))
        .map((a) => {
            const [k, v] = a.replace(/^--/, "").split("=");
            return [k, v ?? "true"];
        }),
);

const scope = args.scope ?? "apps/admin/src";
const level = args.level ?? "warn";

if (level !== "warn" && level !== "error") {
    console.error(`lint-tokens: invalid --level=${level} (expected warn|error)`);
    process.exit(2);
}

/** Colour families with semantic equivalents — these are the banned ones. */
const BANNED_FAMILIES = [
    "red",
    "orange",
    "amber",
    "yellow",
    "lime",
    "green",
    "emerald",
    "teal",
    "cyan",
    "sky",
    "blue",
    "indigo",
    "violet",
    "purple",
    "fuchsia",
    "pink",
    "rose",
];

/** Prefixes that take a colour. */
const PREFIXES = [
    "text",
    "bg",
    "border",
    "ring",
    "from",
    "to",
    "via",
    "decoration",
    "outline",
    "shadow",
    "divide",
    "placeholder",
    "caret",
    "accent",
    "fill",
    "stroke",
];

const PATTERN = new RegExp(`\\b(${PREFIXES.join("|")})-(${BANNED_FAMILIES.join("|")})-\\d{2,3}\\b`);

/** Extensions to scan. */
const ALLOWED_EXTS = new Set([".ts", ".tsx"]);

/** Substring excludes — anything containing these path fragments is skipped. */
const EXCLUDE_FRAGMENTS = ["/node_modules/", "/__tests__/", "/.next/", "/dist/"];

/** Filename suffix excludes. */
const EXCLUDE_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx", "globals.css"];

function shouldSkip(path) {
    if (EXCLUDE_FRAGMENTS.some((f) => path.includes(f))) return true;
    if (EXCLUDE_SUFFIXES.some((s) => path.endsWith(s))) return true;
    return false;
}

function* walk(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (shouldSkip(full)) continue;
        const st = statSync(full);
        if (st.isDirectory()) {
            yield* walk(full);
            continue;
        }
        const ext = full.slice(full.lastIndexOf("."));
        if (!ALLOWED_EXTS.has(ext)) continue;
        yield full;
    }
}

const offenders = [];
for (const file of walk(scope)) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const match = PATTERN.exec(lines[i]);
        if (match === null) continue;
        offenders.push({ file: relative(process.cwd(), file), line: i + 1, hit: match[0], snippet: lines[i].trim() });
    }
}

const label = level === "error" ? "ERROR" : "warn";
const count = offenders.length;
console.log(`lint-tokens: scope=${scope} level=${level} — ${count} raw colour utilit${count === 1 ? "y" : "ies"} found`);
if (count > 0) {
    console.log(
        "Use semantic tokens (text-danger, bg-success, border-warning, …). See apps/admin/src/design-system/DESIGN_SYSTEM.md §3.1.\n",
    );
    for (const o of offenders) {
        console.log(`  ${label}: ${o.file}:${o.line}  [${o.hit}]  ${o.snippet}`);
    }
}

if (level === "error" && count > 0) {
    process.exit(1);
}
process.exit(0);
