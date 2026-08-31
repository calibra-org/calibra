import { describe, expect, it } from "vitest";

import { servicesForProfile } from "../src/core/catalog";
import { composeFiles } from "../src/core/compose-assembly";
import { renderApiEnv } from "../src/core/env-render";
import type { SpinMeta } from "../src/core/meta";
import { apiNdjsonLogFile } from "../src/core/paths";
import { layoutFromBase } from "../src/core/ports";

function meta(overrides: Partial<SpinMeta> = {}): SpinMeta {
    return {
        slug: "demo",
        branch: "spin/demo",
        composeProject: "calibra-spin-demo",
        worktreePath: "/repo/.claude/worktrees/demo",
        ports: layoutFromBase(13044),
        appKey: "a".repeat(64),
        glitchtipSecretKey: "b".repeat(96),
        meiliMasterKey: "c".repeat(64),
        seeded: false,
        profile: "lite",
        tls: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

/**
 * The lite/full split is what keeps a routine bring-up from paying for the observability estate.
 * These pin the three places the profile has to agree: which compose files are stacked, which
 * services the catalog reports, and whether the api is told to export telemetry.
 */
describe("spin profiles", () => {
    it("stacks only the product's own compose files on a lite spin", () => {
        const files = composeFiles(meta()).map((f) => f.split("/").pop());
        expect(files).toEqual(["docker-compose.yml", "docker-compose.caddy.yml", "docker-compose.meili.yml"]);
    });

    it("adds observability + glitchtip on a full spin", () => {
        const files = composeFiles(meta({ profile: "full" })).map((f) => f.split("/").pop());
        expect(files).toContain("docker-compose.observability.yml");
        expect(files).toContain("docker-compose.glitchtip.yml");
    });

    it("drops every observability service from the lite catalog but keeps the datastores", () => {
        const lite = servicesForProfile("lite").map((s) => s.id);
        expect(lite).not.toContain("grafana");
        expect(lite).not.toContain("glitchtip");
        expect(lite).not.toContain("prometheus");
        expect(lite).toEqual(expect.arrayContaining(["api", "db", "redis", "meilisearch", "caddy", "mailpit"]));
        expect(servicesForProfile("full").length).toBeGreaterThan(lite.length);
    });

    /** A dead OTLP endpoint would make every span export retry against a port with nothing behind it. */
    it("omits the OTLP endpoint on a lite spin and wires it on a full one", () => {
        expect(renderApiEnv(meta())).not.toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
        expect(renderApiEnv(meta({ profile: "full" }))).toContain("OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:");
    });

    /**
     * `DEV_OBSERVABILITY` gates the api's ndjson file log, which is the spin panel's log tab — not
     * only Promtail's input. It must stay on for lite spins or the panel shows nothing at all.
     */
    it("keeps the structured file log on in both profiles", () => {
        expect(renderApiEnv(meta())).toContain("DEV_OBSERVABILITY=true");
        expect(renderApiEnv(meta({ profile: "full" }))).toContain("DEV_OBSERVABILITY=true");
    });

    /**
     * pino appends to this file, so spin truncates it when it spawns the api. The env and the
     * truncation must name the same path — if they drift, the panel accumulates a log nothing
     * resets and replays a dead stack's failures as if they were current.
     */
    it("advertises the same api log path that spin truncates on spawn", () => {
        const m = meta();
        expect(renderApiEnv(m)).toContain(`SPIN_API_LOG_PATH=${apiNdjsonLogFile(m.worktreePath)}`);
        expect(apiNdjsonLogFile(m.worktreePath)).toBe("/repo/.claude/worktrees/demo/.spin/logs/api.ndjson");
    });

    /** An IP literal keeps `dns.lookup` (and its libuv threadpool queue) off the connect path. */
    it("dials host-published datastores by loopback IP, never by hostname", () => {
        const env = renderApiEnv(meta());
        expect(env).toContain("REDIS_HOST=127.0.0.1");
        expect(env).toContain("DB_HOST=127.0.0.1");
        expect(env).toContain("SMTP_HOST=127.0.0.1");
        expect(env).toContain("MEILISEARCH_HOST=http://127.0.0.1:");
    });
});
