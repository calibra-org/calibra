import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import vine from "@vinejs/vine";
import { DateTime } from "luxon";

import Plan from "#models/plan";
import Tenant from "#models/tenant";
import FleetMetricsService from "#services/platform/fleet_metrics_service";
import { TenantProvisioningService } from "#services/tenant_provisioning_service";
import { platformTenantsView } from "#table_views/platform/tenants";
import { toTenantDetail, toTenantListItem } from "#transformers/platform/tenant_transformer";
import { createTenantValidator, updateTenantValidator } from "#validators/platform/tenant_validator";

/** Suffix the auto-provisioned primary subdomain uses; also the CNAME target for custom domains. */
const SHOP_DOMAIN_SUFFIX = "shops.calibra.app";

/** Free-text `q` search across slug + name, layered on the TableView grammar (strict mode). */
const tenantsListValidator = platformTenantsView.compileStrict({
    extras: { q: vine.string().trim().maxLength(120).optional() },
});

function admin() {
    return db.connection("postgres_admin");
}

async function loadTenant(id: string | number): Promise<Tenant | null> {
    return Tenant.query({ client: admin() }).where("id", id).whereNull("deleted_at").preload("plan").preload("domains").first();
}

function primaryDomainOf(tenant: Tenant): string | null {
    const primary = tenant.domains.find((d) => d.isPrimary) ?? tenant.domains[0];
    return primary ? String(primary.domain) : null;
}

/**
 * Control-plane CRUD over the tenant fleet. Global (RULE A) — every query runs on the
 * `postgres_admin` (BYPASSRLS) connection and reads across all tenants. Provisioning wraps the one
 * `TenantProvisioningService` (RULE B); there is no duplicate creation path. Guarded by `platformAuth`.
 */
export default class PlatformTenantsController {
    /** Paginated fleet list with per-tenant headline KPIs (orders/revenue 30d + storage). */
    async index(ctx: HttpContext) {
        const parsed = await tenantsListValidator.validate(ctx.request.qs());
        const q = (parsed as { q?: string }).q?.trim();

        const builder = Tenant.query({ client: admin() }).whereNull("deleted_at").preload("plan").preload("domains");
        if (q) {
            builder.where((b) => b.whereILike("slug", `%${q}%`).orWhereILike("name", `%${q}%`));
        }

        const { data, meta } = await platformTenantsView.run(builder, parsed);
        const tenants = data as Tenant[];
        const kpis = await new FleetMetricsService().headlineKpis(tenants.map((t) => Number(t.id)));

        const items = tenants.map((t) =>
            toTenantListItem(
                t,
                primaryDomainOf(t),
                kpis.get(Number(t.id)) ?? { orders: 0, revenue: 0, storageBytes: 0, spark: [] },
            ),
        );
        return { data: items, meta };
    }

    /** Tenant detail: profile, domains, plan + limits vs current usage. */
    async show(ctx: HttpContext) {
        const tenant = await loadTenant(ctx.params.id);
        if (!tenant) {
            return ctx.response.status(404).send({ errors: [{ message: "Tenant not found", code: "E_TENANT_NOT_FOUND" }] });
        }
        const usage = await new FleetMetricsService().tenantUsageCounters(Number(tenant.id));
        return { data: toTenantDetail(tenant, tenant.domains, usage) };
    }

    /** Provision a new shop (wraps `TenantProvisioningService`). Returns the tenant + its shop URL. */
    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createTenantValidator);
        if (!payload.owner_email && !payload.owner_phone) {
            return ctx.response.status(422).send({
                errors: [{ message: "Provide an owner email or phone", code: "E_OWNER_REQUIRED", field: "owner_email" }],
            });
        }

        let result: Awaited<ReturnType<TenantProvisioningService["provision"]>>;
        try {
            result = await new TenantProvisioningService().provision({
                slug: payload.slug,
                name: payload.name,
                planKey: payload.plan_key,
                currencyCode: payload.currency_code,
                primaryLocale: payload.primary_locale,
                templateKey: payload.template_key,
                ownerEmail: payload.owner_email ?? null,
                ownerPhone: payload.owner_phone ?? null,
                platformUserId: ctx.platformUser ? Number(ctx.platformUser.id) : null,
                ipAddress: ctx.request.ip(),
                userAgent: ctx.request.header("user-agent") ?? null,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Provisioning failed";
            const conflict = /reserved|invalid|already|duplicate|unique/i.test(message);
            return ctx.response.status(conflict ? 422 : 500).send({ errors: [{ message, code: "E_PROVISION_FAILED" }] });
        }

        const tenant = await loadTenant(result.id);
        if (!tenant) {
            return ctx.response
                .status(500)
                .send({ errors: [{ message: "Tenant vanished after provisioning", code: "E_PROVISION_FAILED" }] });
        }
        const usage = await new FleetMetricsService().tenantUsageCounters(Number(tenant.id));
        ctx.response.status(201);
        return {
            data: {
                ...toTenantDetail(tenant, tenant.domains, usage),
                shop_url: `https://${result.slug}.${SHOP_DOMAIN_SUFFIX}`,
                /**
                 * Reveal-once owner credentials. The temp password is served exactly here and never
                 * again (no endpoint re-reads it); the durable backstop is single-use + the forced
                 * password change. `temp_password` is null when an explicit password was provided.
                 */
                owner_credentials: {
                    email: result.ownerEmail,
                    temp_password: result.ownerTempPassword,
                    must_change_password: result.mustChangePassword,
                },
            },
        };
    }

    /** Update a shop's name / plan / lifecycle status / template / currency. */
    async update(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(updateTenantValidator);
        const tenant = await loadTenant(ctx.params.id);
        if (!tenant) {
            return ctx.response.status(404).send({ errors: [{ message: "Tenant not found", code: "E_TENANT_NOT_FOUND" }] });
        }

        const patch: Record<string, unknown> = { updated_at: DateTime.utc().toSQL()! };
        if (payload.name !== undefined) patch.name = payload.name;
        if (payload.status !== undefined) patch.status = payload.status;
        if (payload.template_key !== undefined) patch.template_key = payload.template_key;
        if (payload.currency_code !== undefined) patch.currency_code = payload.currency_code;
        if (payload.plan_key !== undefined) {
            const plan = await Plan.query({ client: admin() }).where("key", payload.plan_key).first();
            if (!plan) {
                return ctx.response.status(422).send({
                    errors: [{ message: `Plan "${payload.plan_key}" not found`, code: "E_PLAN_NOT_FOUND", field: "plan_key" }],
                });
            }
            patch.plan_id = plan.id;
            patch.db_tier = plan.dbTier;
        }

        await admin().from("tenants").where("id", Number(tenant.id)).update(patch);

        const fresh = await loadTenant(ctx.params.id);
        const usage = await new FleetMetricsService().tenantUsageCounters(Number(tenant.id));
        return { data: toTenantDetail(fresh!, fresh!.domains, usage) };
    }
}
