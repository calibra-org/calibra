import cache from "@adonisjs/cache/services/main";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import Tenant from "#models/tenant";
import TenantDomain from "#models/tenant_domain";
import { CacheTags } from "#services/cache_keys";
import { generateOwnershipToken, preflightCaa, verifyOwnership, verifyRouting } from "#services/domain_verification_service";
import { recordPlatformAudit } from "#services/platform_audit_service";
import { cnameTargetForTenant, toDomainStatus } from "#transformers/platform/tenant_transformer";
import { attachDomainValidator } from "#validators/platform/domain_validator";

function admin() {
    return db.connection("postgres_admin");
}

async function loadTenant(id: string | number): Promise<Tenant | null> {
    return Tenant.query({ client: admin() }).where("id", id).whereNull("deleted_at").preload("domains").first();
}

/** Bust the host/slug → tenant resolver cache so the new routing state takes effect immediately. */
async function bustTenantCache(): Promise<void> {
    await cache.deleteByTag({ tags: [CacheTags.tenants] });
}

/**
 * Control-plane custom-domain orchestration + verification state machine (RULE C). Records intent on
 * attach (a `pending` row + the exact DNS records the operator must publish), then `recheck` drives
 * the two-gate state machine (ownership → routing+CAA) that flips the row to routable. Routing/TLS
 * itself is enforced at the edge by the R5 predicate ({@link recordPlatformAudit} audits every
 * mutation). Runs on the BYPASSRLS `postgres_admin` connection with explicit `tenant_id` filters;
 * guarded by `platformAuth`.
 */
export default class PlatformDomainsController {
    /** Attach a custom domain; returns the row plus the TXT + CNAME records to publish (pending TLS). */
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
        const token = generateOwnershipToken();
        let createdId = 0;
        await admin().transaction(async (trx) => {
            const rows = await trx
                .table("tenant_domains")
                .insert({
                    tenant_id: Number(tenant.id),
                    domain,
                    kind: "custom",
                    is_primary: false,
                    tls_status: "pending",
                    ownership_token: token,
                    ownership_verified_at: null,
                    routing_verified_at: null,
                    cert_last_error: null,
                    created_at: now,
                    updated_at: now,
                })
                .returning(["id"]);
            createdId = Number(rows[0].id);
            await recordPlatformAudit(trx, {
                platformUserId: ctx.platformUser ? Number(ctx.platformUser.id) : null,
                tenantId: Number(tenant.id),
                action: "domain_added",
                metadata: { domain, domain_id: createdId },
                ipAddress: ctx.request.ip(),
                userAgent: ctx.request.header("user-agent") ?? null,
            });
        });
        await bustTenantCache();

        const created = await TenantDomain.query({ client: admin() }).where("id", createdId).firstOrFail();
        ctx.response.status(201);
        return { data: toDomainStatus(created, cnameTargetForTenant(tenant, tenant.domains)) };
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
        await admin().transaction(async (trx) => {
            await trx.from("tenant_domains").where("id", ctx.params.domainId).where("tenant_id", ctx.params.id).delete();
            await recordPlatformAudit(trx, {
                platformUserId: ctx.platformUser ? Number(ctx.platformUser.id) : null,
                tenantId: Number(ctx.params.id),
                action: "domain_removed",
                metadata: { domain: String(domain.domain), domain_id: Number(domain.id) },
                ipAddress: ctx.request.ip(),
                userAgent: ctx.request.header("user-agent") ?? null,
            });
        });
        await bustTenantCache();
        return { data: { detached: true } };
    }

    /**
     * Re-probe a domain and advance the verification state machine. Ownership is proven first
     * (`pending` → `verifying`); once owned, routing is checked and CAA pre-flighted (→ eligible, or
     * `failed` with `cert_last_error`). Subdomains are already trusted and skip the machine. The
     * `simulated` flag rides through when `SPIN_SIMULATE_DNS` drove the result.
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

        const cnameTarget = cnameTargetForTenant(tenant, tenant.domains);
        let simulated = false;

        if (domain.kind === "subdomain") {
            return { data: toDomainStatus(domain, cnameTarget, false) };
        }

        if (domain.ownershipVerifiedAt === null) {
            const result = await verifyOwnership(String(domain.domain), domain.ownershipToken ?? "");
            simulated = result.simulated;
            if (result.ok) {
                domain.ownershipVerifiedAt = DateTime.utc();
                domain.tlsStatus = "verifying";
                domain.certLastError = null;
            } else {
                domain.tlsStatus = "pending";
                domain.certLastError = result.reason ?? "Ownership not yet verified";
            }
        } else if (domain.routingVerifiedAt === null) {
            const routing = await verifyRouting(String(domain.domain), cnameTarget);
            simulated = routing.simulated;
            if (routing.ok) {
                const caa = await preflightCaa(String(domain.domain));
                simulated = simulated || caa.simulated;
                if (caa.ok) {
                    domain.routingVerifiedAt = DateTime.utc();
                    domain.tlsStatus = "verifying";
                    domain.certLastError = null;
                } else {
                    domain.tlsStatus = "failed";
                    domain.certLastError = caa.reason ?? "CAA preflight failed";
                }
            } else {
                domain.certLastError = routing.reason ?? "Routing not yet verified";
            }
        }

        /**
         * Both gates passed → the domain is eligible; mark the cert `active` locally so the edge
         * predicate routes it. (Real ACME issuance happens at the edge on first request; under
         * simulation there is no real cert but `.localhost` is served by Caddy's internal CA.)
         */
        if (domain.ownershipVerifiedAt !== null && domain.routingVerifiedAt !== null) {
            domain.tlsStatus = "active";
            domain.verifiedAt = domain.verifiedAt ?? DateTime.utc();
            domain.certLastError = null;
        }

        const trx = await admin().transaction();
        try {
            domain.useTransaction(trx);
            await domain.save();
            await trx.commit();
        } catch (error) {
            if (!trx.isCompleted) await trx.rollback();
            throw error;
        }
        await bustTenantCache();

        return { data: toDomainStatus(domain, cnameTarget, simulated) };
    }
}
