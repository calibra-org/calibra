/**
 * Spec-discovery + bin-packing for the CI test matrix. Walks both Japa suites
 * (`tests/unit/**` and `tests/functional/**`) for every `*.spec.ts` file, then
 * partitions them into `SHARD_TOTAL` bins using a greedy longest-processing-time
 * heuristic weighted by file size.
 *
 * Usage:
 *     node scripts/shard-specs.mjs <SHARD_INDEX> <SHARD_TOTAL>
 *
 * Where `SHARD_INDEX` is 1-indexed and `SHARD_INDEX <= SHARD_TOTAL`. The
 * script prints a single space-separated line of relative paths (from
 * `apps/api/`) to stdout; that line is forwarded verbatim to Japa via its
 * variadic `--files` flag. On bad input the script writes one line to stderr
 * and exits 1.
 *
 * Pure `node:fs` + `node:path` + `node:url`; runs without an `node_modules/`
 * having been installed so a fresh checkout can `node scripts/shard-specs.mjs`
 * before anything else.
 */

import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SUITE_ROOTS = ["tests/unit", "tests/functional"];

/**
 * Recursively yield every `*.spec.ts` file under `root`, as paths relative to
 * `apiRoot`. Uses POSIX-style separators in the output so the result is
 * identical on Linux runners and on Windows-WSL developer boxes — Japa's
 * `--files` matcher is byte-exact and any backslashes would skip the match.
 */
function discoverSpecs(apiRoot, root) {
    const absRoot = join(apiRoot, root);
    let entries;
    try {
        entries = readdirSync(absRoot, { withFileTypes: true, recursive: true });
    } catch {
        return [];
    }
    const out = [];
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith(".spec.ts")) continue;
        const absPath = join(entry.parentPath, entry.name);
        out.push(relative(apiRoot, absPath).split(sep).join("/"));
    }
    return out;
}

/**
 * Greedy LPT bin-packing — fill the lightest bin next, ties broken by lowest
 * bin index. Inputs are pre-sorted by weight descending, with secondary
 * ordering by path ascending so the partition is fully deterministic across
 * runs and across hosts.
 */
function packShards(weighted, totalShards) {
    const bins = Array.from({ length: totalShards }, () => ({ files: [], weight: 0 }));
    for (const { path, weight } of weighted) {
        let lightest = 0;
        for (let i = 1; i < bins.length; i += 1) {
            if (bins[i].weight < bins[lightest].weight) lightest = i;
        }
        bins[lightest].files.push(path);
        bins[lightest].weight += weight;
    }
    return bins;
}

/**
 * Parse + validate CLI args. On any deviation from the contract, write a
 * one-line error to stderr and exit 1 — never throw, never silently coerce.
 */
function parseArgs(argv) {
    if (argv.length !== 2) {
        process.stderr.write("usage: shard-specs.mjs <SHARD_INDEX> <SHARD_TOTAL>\n");
        process.exit(1);
    }
    const shardIndex = Number(argv[0]);
    const shardTotal = Number(argv[1]);
    if (!Number.isInteger(shardIndex) || !Number.isInteger(shardTotal)) {
        process.stderr.write(`shard-specs: SHARD_INDEX and SHARD_TOTAL must be integers, got ${argv[0]} ${argv[1]}\n`);
        process.exit(1);
    }
    if (shardTotal < 1 || shardIndex < 1 || shardIndex > shardTotal) {
        process.stderr.write(
            `shard-specs: require 1 <= SHARD_INDEX <= SHARD_TOTAL, got index=${shardIndex} total=${shardTotal}\n`,
        );
        process.exit(1);
    }
    return { shardIndex, shardTotal };
}

const { shardIndex, shardTotal } = parseArgs(process.argv.slice(2));
const specs = SUITE_ROOTS.flatMap((root) => discoverSpecs(API_ROOT, root)).sort();
if (specs.length === 0) {
    process.stderr.write(`shard-specs: no *.spec.ts files found under ${SUITE_ROOTS.join(", ")}\n`);
    process.exit(1);
}
if (shardTotal > specs.length) {
    process.stderr.write(
        `shard-specs: SHARD_TOTAL=${shardTotal} exceeds spec count (${specs.length}); some shards would be empty\n`,
    );
    process.exit(1);
}
const weighted = specs
    .map((path) => ({ path, weight: statSync(join(API_ROOT, path)).size }))
    .sort((a, b) => b.weight - a.weight || a.path.localeCompare(b.path));
const bins = packShards(weighted, shardTotal);
process.stdout.write(`${bins[shardIndex - 1].files.join(" ")}\n`);
