import { describe, expect, it } from "vitest";

import { resolveHost, tenantRefFor } from "./resolve-host";

/** Tests pass `root` explicitly so they don't depend on `NEXT_PUBLIC_ADMIN_ROOT`. */
const ROOT = "admin.calibra.app";

describe("resolveHost (admin)", () => {
    it("resolves a shop subdomain `<slug>.admin.<root>`", () => {
        expect(resolveHost("aurora.admin.calibra.app", ROOT)).toEqual({ kind: "subdomain", slug: "aurora" });
        expect(resolveHost("MEHR.admin.calibra.app:443", ROOT)).toEqual({ kind: "subdomain", slug: "mehr" });
    });

    it("treats the apex root, bare localhost, and infra hosts as platform", () => {
        expect(resolveHost("admin.calibra.app", ROOT)).toEqual({ kind: "platform" });
        expect(resolveHost("localhost:13654", ROOT)).toEqual({ kind: "platform" });
        expect(resolveHost("", ROOT)).toEqual({ kind: "platform" });
        expect(resolveHost(null, ROOT)).toEqual({ kind: "platform" });
    });

    it("treats a mapped admin domain `admin.<domain>` as custom", () => {
        expect(resolveHost("admin.acme.com", ROOT)).toEqual({ kind: "custom", domain: "acme.com" });
    });

    it("resolves the dev direct-port subdomain against an `admin.localhost` root", () => {
        expect(resolveHost("aurora.admin.localhost:13654", "admin.localhost")).toEqual({ kind: "subdomain", slug: "aurora" });
        expect(resolveHost("admin.localhost", "admin.localhost")).toEqual({ kind: "platform" });
    });

    it("resolves the per-spin Caddy tenant host `<slug>.admin.<spin>.spin.localhost`", () => {
        expect(resolveHost("aurora.admin.mt-shop-admin.spin.localhost:13662", ROOT)).toEqual({
            kind: "subdomain",
            slug: "aurora",
        });
        /** The bare admin apex and infra hosts under a spin stay platform. */
        expect(resolveHost("admin.mt-shop-admin.spin.localhost:13662", ROOT)).toEqual({ kind: "platform" });
        expect(resolveHost("grafana.mt-shop-admin.spin.localhost:13662", ROOT)).toEqual({ kind: "platform" });
    });

    it("rejects a non-DNS-label slug", () => {
        expect(resolveHost("a.b.admin.calibra.app", ROOT)).toEqual({ kind: "platform" });
    });

    it("tenantRefFor returns slug / domain / null", () => {
        expect(tenantRefFor({ kind: "subdomain", slug: "aurora" })).toBe("aurora");
        expect(tenantRefFor({ kind: "custom", domain: "acme.com" })).toBe("acme.com");
        expect(tenantRefFor({ kind: "platform" })).toBeNull();
    });
});
