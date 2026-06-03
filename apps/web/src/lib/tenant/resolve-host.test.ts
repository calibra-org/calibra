import { describe, expect, it } from "vitest";

import { resolveHost, tenantRefFor } from "./resolve-host";

const PROD = "shops.calibra.app";
const DEV = "shops.localhost";

describe("resolveHost", () => {
    it("classifies a production subdomain as a shop", () => {
        expect(resolveHost("aurora.shops.calibra.app", PROD)).toEqual({ kind: "subdomain", slug: "aurora" });
    });

    it("classifies a dev subdomain (with port) as a shop", () => {
        expect(resolveHost("mehr.shops.localhost:13823", DEV)).toEqual({ kind: "subdomain", slug: "mehr" });
    });

    it("lowercases and trims the host", () => {
        expect(resolveHost("  Aurora.Shops.Localhost  ", DEV)).toEqual({ kind: "subdomain", slug: "aurora" });
    });

    it("accepts dashed slugs", () => {
        expect(resolveHost("my-shop.shops.calibra.app", PROD)).toEqual({ kind: "subdomain", slug: "my-shop" });
    });

    it("treats the apex root as platform", () => {
        expect(resolveHost("shops.calibra.app", PROD)).toEqual({ kind: "platform" });
    });

    it("treats bare localhost / loopback as platform", () => {
        expect(resolveHost("localhost:3000", DEV)).toEqual({ kind: "platform" });
        expect(resolveHost("127.0.0.1:13823", DEV)).toEqual({ kind: "platform" });
    });

    it("treats spin infra hosts as platform", () => {
        expect(resolveHost("web.mt-storefront.spin.localhost:13830", DEV)).toEqual({ kind: "platform" });
    });

    it("treats a nested label under the root as platform (not a valid single slug)", () => {
        expect(resolveHost("a.b.shops.calibra.app", PROD)).toEqual({ kind: "platform" });
    });

    it("treats an unrelated host as a custom domain", () => {
        expect(resolveHost("acme.com", PROD)).toEqual({ kind: "custom", domain: "acme.com" });
        expect(resolveHost("shop.acme.co.uk:443", PROD)).toEqual({ kind: "custom", domain: "shop.acme.co.uk" });
    });

    it("returns platform for empty / missing host", () => {
        expect(resolveHost("", PROD)).toEqual({ kind: "platform" });
        expect(resolveHost(null, PROD)).toEqual({ kind: "platform" });
        expect(resolveHost(undefined, PROD)).toEqual({ kind: "platform" });
    });
});

describe("tenantRefFor", () => {
    it("returns the slug for a subdomain", () => {
        expect(tenantRefFor({ kind: "subdomain", slug: "aurora" })).toBe("aurora");
    });
    it("returns the domain for a custom host", () => {
        expect(tenantRefFor({ kind: "custom", domain: "acme.com" })).toBe("acme.com");
    });
    it("returns null for platform", () => {
        expect(tenantRefFor({ kind: "platform" })).toBeNull();
    });
});
