import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "@japa/runner";

const API_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SCRIPT = resolve(API_ROOT, "scripts", "shard-specs.mjs");
const SUITE_ROOTS = ["tests/unit", "tests/functional"];

/**
 * Invoke the shard script and return its parsed line of relative spec paths.
 * Pure stdout consumption — failure modes (non-zero exit, malformed output)
 * surface as thrown exceptions and bubble up as test failures.
 */
function runShard(shardIndex: number, shardTotal: number): string[] {
    const stdout = execFileSync("node", [SCRIPT, String(shardIndex), String(shardTotal)], {
        cwd: API_ROOT,
        encoding: "utf8",
    });
    return stdout.trim().length === 0 ? [] : stdout.trim().split(" ");
}

/**
 * Spawn the script with deliberately bad args and report `{ status, stderr }`
 * without throwing — the test asserts both that the process failed and that
 * stderr carries a helpful one-line message.
 */
function runShardFailing(...args: string[]): { status: number | null; stderr: string } {
    try {
        execFileSync("node", [SCRIPT, ...args], { cwd: API_ROOT, encoding: "utf8", stdio: "pipe" });
        return { status: 0, stderr: "" };
    } catch (error) {
        const e = error as { status?: number | null; stderr?: Buffer | string };
        const stderr = e.stderr === undefined ? "" : typeof e.stderr === "string" ? e.stderr : e.stderr.toString();
        return { status: e.status ?? null, stderr };
    }
}

/**
 * Mirror the script's discovery — every `*.spec.ts` under both suite roots,
 * in POSIX form relative to `apps/api/`. The two sources have to agree for
 * any union assertion below to be meaningful.
 */
function discoverAllSpecs(): string[] {
    const out: string[] = [];
    for (const root of SUITE_ROOTS) {
        const entries = readdirSync(resolve(API_ROOT, root), { withFileTypes: true, recursive: true });
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith(".spec.ts")) continue;
            const abs = resolve(entry.parentPath, entry.name);
            out.push(
                abs
                    .slice(API_ROOT.length + 1)
                    .split(/[\\/]/)
                    .join("/"),
            );
        }
    }
    return out.sort();
}

test.group("shard-specs script", () => {
    test("union of N=5 shards equals full spec discovery with no duplicates", ({ assert }) => {
        const shards = [1, 2, 3, 4, 5].map((i) => runShard(i, 5));
        const union = shards.flat();
        const expected = discoverAllSpecs();
        assert.equal(union.length, expected.length, "raw union should equal spec count (no duplicates)");
        assert.deepEqual([...new Set(union)].sort(), expected, "deduped union should equal discovered specs");
    });

    test("union of N=7 shards equals full spec discovery with no duplicates", ({ assert }) => {
        const shards = [1, 2, 3, 4, 5, 6, 7].map((i) => runShard(i, 7));
        const union = shards.flat();
        const expected = discoverAllSpecs();
        assert.equal(union.length, expected.length);
        assert.deepEqual([...new Set(union)].sort(), expected);
    });

    test("every shard is non-empty for N up to the spec count", ({ assert }) => {
        for (const total of [5, 7]) {
            for (let i = 1; i <= total; i += 1) {
                const shard = runShard(i, total);
                assert.isAbove(shard.length, 0, `shard ${i}/${total} should not be empty`);
            }
        }
    });

    test("every emitted path ends in .spec.ts (Japa --files matcher safety)", ({ assert }) => {
        const all = runShard(1, 5).concat(runShard(5, 5));
        for (const path of all) {
            assert.match(path, /\.spec\.ts$/, `expected ${path} to end in .spec.ts`);
        }
    });

    test("same (index, total) returns identical output across runs (determinism)", ({ assert }) => {
        for (const [index, total] of [
            [1, 5],
            [3, 5],
            [5, 5],
            [4, 7],
        ] as const) {
            assert.deepEqual(runShard(index, total), runShard(index, total));
        }
    });

    test("bad args exit 1 with a helpful stderr message", ({ assert }) => {
        for (const args of [[], ["0", "5"], ["6", "5"], ["1", "0"], ["a", "5"], ["1", "200"]]) {
            const { status, stderr } = runShardFailing(...args);
            assert.equal(status, 1, `args ${JSON.stringify(args)} should exit 1`);
            assert.isAbove(stderr.length, 0, `args ${JSON.stringify(args)} should emit a stderr message`);
        }
    });
});
