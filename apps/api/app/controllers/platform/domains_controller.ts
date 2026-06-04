import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import Tenant from "#models/tenant";
import TenantDomain from "#models/tenant_domain";
import { toTenantDomain } from "#transformers/platform/tenant_transformer";
import { attachDomainValidator } from "#validators/platform/domain_validator";

function admin() {
    return db.connection("postgres_admin");
}

async function loadTenant(id: string | number): Promise<Tenant | null> {
    return Tenant.query({ client: admin() }).where("id", id).whereNull("deleted_at").preload("domains").first();
}

/** The CNAME target a custom domain should point at — the tenant's primary subdomain. */
function cnameTargetOf(tenant: Tenant): string | null {
    const primary = tenant.domains.find((d) => d.isPrimary && d.kind === "subdomain") ?? tenant.domains.find((d) => d.isPrimary);
    return primary ? String(primary.domain) : `${String(tenant.slug)}.shops.calibra.app`;
}

/**
 * Control-plane custom-domain orchestration (RULE C). The control plane only records intent — a
 * `tenant_domains` row with `tls_status=pending` and the CNAME the operator must create — while the
 * actual TLS issuance happens at the edge (Phase 6, Caddy on-demand). `recheck` re-reads the current
 * status. Global connection; guarded by `platformAuth`.
 */
export default class PlatformDomainsController {
    /** Attach a custom domain; returns the row plus the CNAME target + pending TLS status. */
    async store(ctx: HttpContext) {
        const { domain } = await ctx.request.validateUsing(attachDomainValidator);
        const tenant = await loadTenant(ctx.params.id);
        if (!tenant) {
            return ctx.response.status(404).send({ errors: [{ message: "Tenant not found", code: "E_TENANT_NOT_FOUND" }] });
        }

        const clash = await admin().from("tenant_domains").where("domain", domain).first();
        if (clash) {
            return ctx.response
                .status(409)
                .send({ errors: [{ message: "Domain already attached", code: "E_DOMAIN_TAKEN", field: "domain" }] });
        }

        const now = DateTime.utc().toSQL()!;
        const rows = await admin()
            .table("tenant_domains")
            .insert({
                tenant_id: Number(tenant.id),
                domain,
                kind: "custom",
                is_primary: false,
                tls_status: "pending",
                created_at: now,
                updated_at: now,
            })
            .returning(["id"]);
        const created = await TenantDomain.query({ client: admin() }).where("id", Number(rows[0].id)).firstOrFail();

        ctx.response.status(201);
        return { data: toTenantDomain(created, cnameTargetOf(tenant)) };
    }

    /** Detach a custom domain. The auto-provisioned primary subdomain can't be removed. */
    async destroy(ctx: HttpContext) {
        const domain = await admin()
            .from("tenant_domains")
            .where("id", ctx.params.domainId)
            .where("tenant_id", ctx.params.id)
            .first();
        if (!domain) {
            return ctx.response.status(404).send({ errors: [{ message: "Domain not found", code: "E_DOMAIN_NOT_FOUND" }] });
        }
        if (domain.is_primary) {
            return ctx.response
                .status(409)
                .send({ errors: [{ message: "Can't detach the primary domain", code: "E_PRIMARY_DOMAIN" }] });
        }
        await admin().from("tenant_domains").where("id", ctx.params.domainId).delete();
        return { data: { detached: true } };
    }

    /**
     * Re-probe a domain's verification / TLS status. In Phase 5 the edge doesn't issue certs yet, so
     * this reflects the stored status as-is (Phase 6 flips `pending` → `active` once Caddy succeeds).
     */
    async recheck(ctx: HttpContext) {
        const tenant = await loadTenant(ctx.params.id);
        if (!tenant) {
            return ctx.response.status(404).send({ errors: [{ message: "Tenant not found", code: "E_TENANT_NOT_FOUND" }] });
        }
        const domain = await TenantDomain.query({ client: admin() })
            .where("id", ctx.params.domainId)
            .where("tenant_id", ctx.params.id)
            .first();
        if (!domain) {
            return ctx.response.status(404).send({ errors: [{ message: "Domain not found", code: "E_DOMAIN_NOT_FOUND" }] });
        }
        return { data: toTenantDomain(domain, cnameTargetOf(tenant)) };
    }
}
