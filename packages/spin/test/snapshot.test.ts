import { describe, expect, it } from "vitest";

import { serviceById } from "../src/core/catalog";
import type { SpinMeta } from "../src/core/meta";
import { layoutFromBase } from "../src/core/ports";
import { dashboardUrl, serviceUrl } from "../src/core/snapshot";
import { snapshotHasFailure } from "../src/core/snapshot-types";

function makeMeta(): SpinMeta {
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
        prNumber: null,
        observability: true,
        tls: true,
        createdAt: "2026-01-01T00:00:00.000Z",
    };
}

describe("serviceUrl (pure, no probing)", () => {
    const meta = makeMeta();
    const caddyHttps = layoutFromBase(13044).caddyHttps;

    it("routes Caddy-fronted services to their https host", () => {
        expect(serviceUrl(meta, serviceById("grafana")!)).toBe(`https://grafana.demo.spin.localhost:${caddyHttps}/`);
        expect(serviceUrl(meta, serviceById("api")!)).toBe(`https://api.demo.spin.localhost:${caddyHttps}/`);
    });

    it("uses the apex for the spin agent and the dashboard for caddy", () => {
        expect(serviceUrl(meta, serviceById("agent")!)).toBe(`https://demo.spin.localhost:${caddyHttps}/`);
        expect(serviceUrl(meta, serviceById("caddy")!)).toBe(dashboardUrl(meta));
    });

    it("uses scheme URLs for datastores without a Caddy route", () => {
        expect(serviceUrl(meta, serviceById("db")!)).toBe(`postgres://localhost:${meta.ports.db}`);
        expect(serviceUrl(meta, serviceById("redis")!)).toBe(`redis://localhost:${meta.ports.redis}`);
        expect(serviceUrl(meta, serviceById("pgadmin")!)).toBe(`http://localhost:${meta.ports.pgadmin}/`);
    });
});

describe("snapshotHasFailure", () => {
    const baseSnapshot = {
        slug: "demo",
        branch: "spin/demo",
        composeProject: "calibra-spin-demo",
        worktreePath: "/x",
        worktreeExists: true,
        dashboardUrl: "https://demo.spin.localhost:1/",
        pr: null,
        prUrl: null,
        ports: layoutFromBase(13044),
        services: [
            { id: "api", label: "API", category: "app" as const, kind: "host" as const, url: null, status: "up" as const },
        ],
        tenants: [],
        queueWorker: { pid: 1, status: "up" as const },
        run: { kind: "none" as const },
        glitchtipDsn: null,
        legacyDevUi: false,
        generatedAt: "2026",
    };

    it("is false when everything is up", () => {
        expect(snapshotHasFailure(baseSnapshot)).toBe(false);
    });

    it("is true when a service is down", () => {
        expect(snapshotHasFailure({ ...baseSnapshot, services: [{ ...baseSnapshot.services[0]!, status: "down" }] })).toBe(true);
    });

    it("is true when a tenant admin is down (the multi-tenant signal)", () => {
        expect(
            snapshotHasFailure({
                ...baseSnapshot,
                tenants: [{ slug: "aurora", name: "Aurora", adminUrl: "u", webUrl: "w", adminStatus: "down" }],
            }),
        ).toBe(true);
    });

    it("is true when the last run failed", () => {
        expect(snapshotHasFailure({ ...baseSnapshot, run: { kind: "failed", error: "boom" } })).toBe(true);
    });
});
