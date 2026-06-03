import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import app from "@adonisjs/core/services/app";
import { test } from "@japa/runner";

/**
 * Static guard against the tenant-scoping bug class that shipped repeatedly undetected: a query run
 * on the **bare global `db`** (`db.from` / `db.table` / `db.query` / `db.rawQuery`) instead of the
 * per-request transaction. Such a query grabs a pooled connection with **no** `app.current_tenant`
 * GUC, so under the runtime `calibra_app` role (NOBYPASSRLS) the `tenant_isolation` policy returns
 * zero rows (silently empty dashboards) or — before the NULLIF hardening — crashed with 22P02.
 *
 * The functional suite can't catch this on its own because it runs as a BYPASSRLS superuser, so RLS
 * never executes. This guard works at the source level instead: tenant-scoped controllers, services,
 * and jobs must reach the DB through `currentTrx()` / `withTenantTransaction()` / a Lucid model
 * (all of which ride the GUC-bearing request transaction), never the global `db`.
 *
 * Allowed bare-`db` forms (NOT matched): `db.raw(...)` (a SQL fragment, no connection), and
 * `db.connection("postgres_admin")...` / `db.transaction(...)` / `db.manager...` (explicit
 * control-plane / own-transaction escape hatches). If a site legitimately needs the bare global
 * connection on a GLOBAL (non-RLS) table, add it to {@link ALLOWLIST} with a one-line justification.
 */
const SCAN_DIRS = ["controllers", "services", "jobs"];

/** `db.from` / `db.table` / `db.query` / `db.rawQuery` where `db` is the bare global import. The
 * negative lookbehind rejects `foo.db.` / `mydb.` so only the imported default connection matches. */
const BARE_DB_RE = /(?<![\w.])db\s*\.\s*(?:from|table|query|rawQuery)\b/;

/** Files permitted to use the bare global `db` (global/control-plane tables only). Keep justified. */
const ALLOWLIST = new Set<string>([]);

async function walkTsFiles(dir: string): Promise<string[]> {
    const out: string[] = [];
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...(await walkTsFiles(full)));
        } else if (entry.name.endsWith(".ts")) {
            out.push(full);
        }
    }
    return out;
}

test.group("no bare-db tenant queries (static guard)", () => {
    test("controllers / services / jobs never query tenant tables on the bare global db", async ({ assert }) => {
        const appRoot = app.makePath("app");
        const violations: string[] = [];

        for (const sub of SCAN_DIRS) {
            for (const file of await walkTsFiles(join(appRoot, sub))) {
                const rel = file.slice(appRoot.length + 1);
                if (ALLOWLIST.has(rel)) continue;
                const source = await readFile(file, "utf8");
                /** Only files that import the global db can use it; skip the rest cheaply. */
                if (!source.includes('from "@adonisjs/lucid/services/db"')) continue;
                const lines = source.split("\n");
                for (let i = 0; i < lines.length; i += 1) {
                    /** Join with the next line so multi-line `db\n  .from(` is still caught. */
                    const window = `${lines[i]} ${lines[i + 1] ?? ""}`;
                    if (BARE_DB_RE.test(window)) {
                        violations.push(`${rel}:${i + 1}  ${lines[i]!.trim()}`);
                    }
                }
            }
        }

        assert.deepEqual(
            violations,
            [],
            `Found bare-global-db queries on (likely) tenant tables. Use currentTrx() / withTenantTransaction() / a model so the query rides the request transaction's app.current_tenant GUC. If the target is a GLOBAL non-RLS table, add the file to ALLOWLIST with justification.\n${violations.join("\n")}`,
        );
    });
});
