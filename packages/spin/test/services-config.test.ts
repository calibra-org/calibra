import { describe, expect, it } from "vitest";
import { CONTAINER_SERVICES, DEMO_TENANTS, HOST_SERVICES, SERVICES, serviceById } from "../src/core/catalog";
import { ROLES } from "../src/core/ports";

const ROLE_SET = new Set<string>(ROLES);

describe("services catalog", () => {
    it("has unique service ids", () => {
        const ids = SERVICES.map((service) => service.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("every declared port role is a real role in the frozen table", () => {
        for (const service of SERVICES) {
            if (service.portRole) expect(ROLE_SET.has(service.portRole)).toBe(true);
        }
    });

    it("container services name a compose service; host services do not", () => {
        for (const service of CONTAINER_SERVICES) expect(service.composeService).toBeTruthy();
        for (const service of HOST_SERVICES) expect(service.composeService).toBeUndefined();
    });

    it("host-upstream Caddy routes have a port role to resolve the host port", () => {
        for (const service of SERVICES) {
            if (service.caddy?.upstream === "host") expect(service.portRole).toBeTruthy();
        }
    });

    it("only admin + web carry the per-tenant wildcard", () => {
        const wildcarded = SERVICES.filter((service) => service.caddy?.tenantWildcard).map((service) => service.id);
        expect(wildcarded.sort()).toEqual(["admin", "web"]);
    });

    it("exposes the five required host apps", () => {
        for (const id of ["api", "queue", "admin", "web", "agent"]) {
            expect(serviceById(id)?.kind).toBe("host");
        }
    });

    it("seeds the three demo tenants matching the api seeder", () => {
        expect(DEMO_TENANTS.map((tenant) => tenant.slug)).toEqual(["aurora", "mehr", "kasra"]);
    });
});
