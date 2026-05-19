import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BaseCommand, flags } from "@adonisjs/core/ace";
import router from "@adonisjs/core/services/router";
import type { CommandOptions } from "@adonisjs/core/types/ace";

/**
 * Diff entry produced by {@link diff}. Each value indicates a single drift between the live
 * Adonis router and the bundled OpenAPI specs.
 *
 * - `missing-in-spec` — code registers an endpoint that the spec does not document.
 * - `stale-in-spec`   — spec documents an endpoint the code no longer registers.
 * - `mismatch`        — the same path is documented under a different method than the code uses.
 */
export interface Issue {
    severity: "missing-in-spec" | "stale-in-spec" | "mismatch";
    codeKey?: string;
    specKey?: string;
    message: string;
}

export interface CodeRoute {
    method: string;
    path: string;
}

export interface SpecOperation {
    method: string;
    path: string;
    operationId: string | null;
}

/** Methods we consider when matching against the spec; the rest are ignored as router noise. */
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);

/** Paths the lint deliberately excludes (operational endpoints we never expose to API consumers). */
const PATH_EXCLUSIONS = new Set(["/health"]);

/**
 * Acknowledged drift carried over from before the lint was wired up — listed in
 * `.check-api-docs-known-drift.json`. Entries here suppress the corresponding `Issue` so CI only
 * fails on *new* drift; remove an entry when the spec or the route table catches up.
 */
export interface KnownDriftEntry {
    severity: Issue["severity"];
    codeKey?: string;
    specKey?: string;
}

/**
 * Pure diff: compares the live router (`codeRoutes`) against the union of every documented spec
 * operation (`specRoutes`). The function is exported for direct unit testing — wire it up by
 * passing fixture data; do not stand up an Adonis app in tests.
 *
 * Matching is `(method, path-template)` after both sides are normalised by {@link normalisePath}.
 * `operationId` is informational — it appears in the issue message but never participates in the
 * match itself, since spec authors choose IDs by convention rather than from a stable registry.
 */
export function diff(codeRoutes: CodeRoute[], specRoutes: SpecOperation[]): Issue[] {
    const codeByKey = new Map<string, CodeRoute>();
    for (const route of codeRoutes) {
        codeByKey.set(routeKey(route.method, route.path), route);
    }

    const specByKey = new Map<string, SpecOperation>();
    const specPathMethods = new Map<string, Set<string>>();
    for (const op of specRoutes) {
        const key = routeKey(op.method, op.path);
        specByKey.set(key, op);
        if (!specPathMethods.has(op.path)) specPathMethods.set(op.path, new Set());
        specPathMethods.get(op.path)?.add(op.method);
    }

    const codePathMethods = new Map<string, Set<string>>();
    for (const route of codeRoutes) {
        if (!codePathMethods.has(route.path)) codePathMethods.set(route.path, new Set());
        codePathMethods.get(route.path)?.add(route.method);
    }

    const issues: Issue[] = [];
    const reported = new Set<string>();

    for (const route of codeRoutes) {
        const key = routeKey(route.method, route.path);
        if (specByKey.has(key)) continue;
        const otherSpecMethods = specPathMethods.get(route.path);
        if (otherSpecMethods && otherSpecMethods.size > 0) {
            const otherCodeMethods = codePathMethods.get(route.path) ?? new Set();
            const truelyMissing = [...otherSpecMethods].filter((m) => !otherCodeMethods.has(m));
            if (truelyMissing.length > 0) {
                issues.push({
                    severity: "mismatch",
                    codeKey: key,
                    specKey: `${truelyMissing.join("|")} ${route.path}`,
                    message: `path documented under ${truelyMissing.join("/")} but code registers ${route.method}`,
                });
                for (const m of truelyMissing) reported.add(routeKey(m, route.path));
                reported.add(key);
                continue;
            }
        }
        issues.push({
            severity: "missing-in-spec",
            codeKey: key,
            message: "endpoint exists in code but is not documented",
        });
    }

    for (const op of specRoutes) {
        const key = routeKey(op.method, op.path);
        if (reported.has(key)) continue;
        if (codeByKey.has(key)) continue;
        const otherCodeMethods = codePathMethods.get(op.path);
        if (otherCodeMethods && otherCodeMethods.size > 0) {
            const truelyExtra = [...otherCodeMethods].filter((m) => !(specPathMethods.get(op.path)?.has(m) ?? false));
            if (truelyExtra.length > 0) {
                issues.push({
                    severity: "mismatch",
                    codeKey: `${truelyExtra.join("|")} ${op.path}`,
                    specKey: key,
                    message:
                        `path registered under ${truelyExtra.join("/")} but spec declares ${op.method}` +
                        (op.operationId ? ` (operationId: ${op.operationId})` : ""),
                });
                reported.add(key);
                continue;
            }
        }
        issues.push({
            severity: "stale-in-spec",
            specKey: key,
            message: "endpoint documented but no longer registered" + (op.operationId ? ` (operationId: ${op.operationId})` : ""),
        });
    }

    return issues;
}

/**
 * Normalises `(method, path)` into the canonical comparison key. Trims trailing slashes, drops
 * query strings, and converts Adonis' `:slug` parameters into OpenAPI's `{slug}` form so both
 * sides agree on the path-template shape.
 */
export function normalisePath(path: string): string {
    const stripped = path.split("?")[0]?.replace(/\/+$/, "") ?? "";
    return stripped.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function routeKey(method: string, path: string): string {
    return `${method.toUpperCase()} ${normalisePath(path)}`;
}

/**
 * Stable identity used to match a runtime {@link Issue} against an entry in the known-drift file.
 * Encodes severity plus whichever side(s) the issue references, so `missing-in-spec` and
 * `stale-in-spec` rows on the same path remain distinguishable.
 */
function driftKey(entry: { severity: Issue["severity"]; codeKey?: string; specKey?: string }): string {
    return `${entry.severity}|${entry.codeKey ?? ""}|${entry.specKey ?? ""}`;
}

function byIssueOrder(a: Issue, b: Issue): number {
    return a.severity.localeCompare(b.severity) || (a.codeKey ?? a.specKey ?? "").localeCompare(b.codeKey ?? b.specKey ?? "");
}

/**
 * Linter — boots the Adonis container, dumps every registered route, loads both bundled OpenAPI
 * specs, and prints a single diff table when drift is found. Exits with status 1 on any drift so
 * CI can gate merges on documentation coverage.
 */
export default class CheckApiDocs extends BaseCommand {
    static commandName = "check:api-docs";
    static description = "Compare registered Adonis routes against the bundled OpenAPI spec";
    static options: CommandOptions = { startApp: true };

    @flags.boolean({
        description: "Overwrite .check-api-docs-known-drift.json with every drift the current run finds. Use with care.",
    })
    declare updateKnownDrift: boolean;

    async run() {
        const codeRoutes = this.collectCodeRoutes();

        const specs = ["storefront.v1.json", "admin.v1.json"];
        const specRoutes: SpecOperation[] = [];
        for (const file of specs) {
            const distPath = resolve(this.app.makePath(), "../../docs/api/dist", file);
            let raw: string;
            try {
                raw = await readFile(distPath, "utf8");
            } catch (err) {
                this.logger.error(`Could not read ${file} — run \`pnpm --filter @calibra/api-docs run build:json\` first.`);
                throw err;
            }
            specRoutes.push(...this.collectSpecOperations(JSON.parse(raw)));
        }

        const allIssues = diff(codeRoutes, specRoutes);

        if (this.updateKnownDrift) {
            await this.writeKnownDrift(allIssues);
            this.logger.success(`Wrote ${allIssues.length} drift entry(ies) to .check-api-docs-known-drift.json.`);
            return;
        }

        const known = await this.loadKnownDrift();
        const knownKeys = new Set(known.map(driftKey));
        const seenKeys = new Set<string>();
        const newIssues: Issue[] = [];
        for (const issue of allIssues) {
            const key = driftKey(issue);
            seenKeys.add(key);
            if (!knownKeys.has(key)) newIssues.push(issue);
        }
        const resolvedKnown = [...knownKeys].filter((k) => !seenKeys.has(k));

        if (newIssues.length === 0 && resolvedKnown.length === 0) {
            const knownNote = known.length > 0 ? ` (${known.length} known drift entries acknowledged)` : "";
            this.logger.success(
                `API docs in sync${knownNote} (${codeRoutes.length} code routes, ${specRoutes.length} spec operations).`,
            );
            return;
        }

        if (newIssues.length > 0) {
            const table = this.ui.table();
            table.head(["Severity", "Code (method path)", "Spec (method path)", "Issue"]);
            for (const issue of newIssues.sort(byIssueOrder)) {
                table.row([issue.severity, issue.codeKey ?? "—", issue.specKey ?? "—", issue.message]);
            }
            table.render();
            this.logger.error(
                `Found ${newIssues.length} new drift issue(s). Fix the spec under docs/api/reference/openapi/, ` +
                    `update the route table under apps/api/start/routes/, or add a justified entry to ` +
                    `apps/api/.check-api-docs-known-drift.json.`,
            );
            this.exitCode = 1;
        }

        if (resolvedKnown.length > 0) {
            this.logger.warning(
                `${resolvedKnown.length} entry(ies) in .check-api-docs-known-drift.json no longer apply — remove them:`,
            );
            for (const k of resolvedKnown.sort()) this.logger.warning(`  - ${k}`);
            if (newIssues.length === 0) this.exitCode = 1;
        }
    }

    /**
     * Reads the known-drift JSON file alongside `apps/api/` if present. Returns an empty list when
     * the file does not exist — a freshly cloned project has no acknowledged drift by default.
     */
    private async loadKnownDrift(): Promise<KnownDriftEntry[]> {
        const path = this.knownDriftPath();
        try {
            const raw = await readFile(path, "utf8");
            return JSON.parse(raw) as KnownDriftEntry[];
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw err;
        }
    }

    private async writeKnownDrift(issues: Issue[]): Promise<void> {
        const path = this.knownDriftPath();
        const entries: KnownDriftEntry[] = issues
            .map((i) => ({ severity: i.severity, codeKey: i.codeKey, specKey: i.specKey }))
            .sort((a, b) => driftKey(a).localeCompare(driftKey(b)));
        await writeFile(path, JSON.stringify(entries, null, 2) + "\n");
    }

    private knownDriftPath(): string {
        return resolve(this.app.makePath(), ".check-api-docs-known-drift.json");
    }

    /** Returns every router entry under `/api/v1/`, normalised, with operational paths excluded. */
    private collectCodeRoutes(): CodeRoute[] {
        router.commit();
        const out: CodeRoute[] = [];
        const tree = router.toJSON();
        for (const routes of Object.values(tree)) {
            for (const route of routes) {
                const path = normalisePath(route.pattern);
                if (PATH_EXCLUSIONS.has(path)) continue;
                if (!path.startsWith("/api/v1/")) continue;
                for (const method of route.methods) {
                    const upper = method.toUpperCase();
                    if (!HTTP_METHODS.has(upper)) continue;
                    out.push({ method: upper, path });
                }
            }
        }
        return out;
    }

    /** Walks a bundled OpenAPI document and lifts every operation into a flat list. */
    private collectSpecOperations(spec: { paths?: Record<string, Record<string, { operationId?: string }>> }): SpecOperation[] {
        const out: SpecOperation[] = [];
        for (const [path, methods] of Object.entries(spec.paths ?? {})) {
            const normalised = normalisePath(path);
            for (const [method, op] of Object.entries(methods)) {
                const upper = method.toUpperCase();
                if (!HTTP_METHODS.has(upper)) continue;
                out.push({ method: upper, path: normalised, operationId: op.operationId ?? null });
            }
        }
        return out;
    }
}
