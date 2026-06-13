import { describe, expect, it } from "vitest";

import {
    nextDevAllowedOrigins,
    renderApiEnv,
    renderCaddyfile,
    renderPlatformEnv,
    SPIN_ENV_HEADER_MARKER,
} from "../src/core/env-render";
import type { SpinMeta } from "../src/core/meta";
import { layoutFromBase } from "../src/core/ports";

function makeMeta(overrides: Partial<SpinMeta> = {}): SpinMeta {
    const base = 13044;
    return {
        slug: "demo",
        branch: "spin/demo",
        composeProject: "calibra-spin-demo",
        worktreePath: "/repo/.claude/worktrees/demo",
        ports: layoutFromBase(base),
        appKey: "a".repeat(64),
        glitchtipSecretKey: "b".repeat(96),
        meiliMasterKey: "c".repeat(64),
        edgeSecret: "d".repeat(64),
        seeded: false,
        prNumber: null,
        observability: true,
        tls: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

describe("renderCaddyfile", () => {
    it("emits apex hosts for the spin agent, api, admin and web", () => {
        const out = renderCaddyfile(makeMeta());
        expect(out).toContain("demo.spin.localhost {");
        expect(out).toContain("api.demo.spin.localhost {");
        expect(out).toContain("admin.demo.spin.localhost {");
        expect(out).toContain("web.demo.spin.localhost {");
        expect(out).toContain("console.demo.spin.localhost {");
    });

    it("emits an explicit block per seeded tenant (the cert-issuance fix)", () => {
        const out = renderCaddyfile(makeMeta());
        for (const tenant of ["aurora", "mehr", "kasra"]) {
            expect(out).toContain(`${tenant}.admin.demo.spin.localhost {`);
            expect(out).toContain(`${tenant}.web.demo.spin.localhost {`);
        }
    });

    it("emits an on-demand-TLS wildcard for ad-hoc tenants, with an ask endpoint", () => {
        const out = renderCaddyfile(makeMeta());
        expect(out).toContain("*.admin.demo.spin.localhost {");
        expect(out).toContain("on_demand");
        expect(out).toContain("ask http://host.docker.internal:");
        expect(out).toContain("/api/caddy/ask");
    });

    it("routes container services by compose name and host apps via host.docker.internal", () => {
        const out = renderCaddyfile(makeMeta());
        expect(out).toContain("reverse_proxy grafana:3000");
        expect(out).toContain("reverse_proxy meilisearch:7700");
        expect(out).toMatch(/admin\.demo\.spin\.localhost \{[\s\S]*?reverse_proxy host\.docker\.internal:13047/);
    });

    it("emits a catch-all on-demand block routing arbitrary custom domains to the storefront", () => {
        const out = renderCaddyfile(makeMeta());
        const webPort = layoutFromBase(13044).web;
        expect(out).toMatch(
            new RegExp(`https:\\/\\/ \\{[\\s\\S]*?on_demand[\\s\\S]*?reverse_proxy host\\.docker\\.internal:${webPort}`),
        );
    });
});

describe("renderApiEnv", () => {
    it("starts with the spin env header marker (the local clobber guard greps for it)", () => {
        expect(renderApiEnv(makeMeta())).toContain(SPIN_ENV_HEADER_MARKER);
    });

    it("advertises the canonical Caddy-TLS impersonation template", () => {
        const out = renderApiEnv(makeMeta());
        const caddyHttps = layoutFromBase(13044).caddyHttps;
        expect(out).toContain(`ADMIN_URL_TEMPLATE=https://{slug}.admin.demo.spin.localhost:${caddyHttps}`);
    });

    it("wires the edge secret + local DNS simulation for custom-domain verification", () => {
        const out = renderApiEnv(makeMeta());
        expect(out).toContain(`EDGE_SECRET=${"d".repeat(64)}`);
        expect(out).toContain("SPIN_SIMULATE_DNS=1");
    });

    it("uses the fixed two-role DB split and direct-port api base", () => {
        const out = renderApiEnv(makeMeta());
        expect(out).toContain("DB_USER=calibra_app");
        expect(out).toContain("DB_ADMIN_USER=calibra_admin");
        expect(out).toContain("DB_SUPERUSER_USER=calibra");
    });

    it("throws loudly when a required port is missing (no silent empty value)", () => {
        const meta = makeMeta();
        delete (meta.ports as Record<string, unknown>).tempo;
        expect(() => renderApiEnv(meta)).toThrow(/missing a required port "tempo"/);
    });

    it("falls back to the direct-port impersonation scheme when there is no edge layer", () => {
        const meta = makeMeta();
        delete (meta.ports as Record<string, unknown>).caddyHttps;
        delete (meta.ports as Record<string, unknown>).caddyHttp;
        const out = renderApiEnv(meta);
        expect(out).toContain(`ADMIN_URL_TEMPLATE=http://{slug}.admin.localhost:${meta.ports.admin}`);
    });
});

describe("nextDevAllowedOrigins", () => {
    it("includes per-tenant hosts in both the Caddy and direct-port schemes", () => {
        const origins = nextDevAllowedOrigins(makeMeta()).split(",");
        expect(origins).toContain("aurora.admin.demo.spin.localhost");
        expect(origins).toContain("aurora.web.demo.spin.localhost");
        expect(origins).toContain("aurora.admin.localhost");
        expect(origins).toContain("admin.demo.spin.localhost");
    });
});

describe("renderPlatformEnv", () => {
    it("is null when the spin has no platform port", () => {
        const meta = makeMeta();
        delete (meta.ports as Record<string, unknown>).platform;
        expect(renderPlatformEnv(meta)).toBeNull();
    });

    it("renders when the platform port is present", () => {
        expect(renderPlatformEnv(makeMeta())).toContain("NEXT_PUBLIC_API_BASE_URL=");
    });
});
