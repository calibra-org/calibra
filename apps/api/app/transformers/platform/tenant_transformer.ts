import type Plan from "#models/plan";
import type Tenant from "#models/tenant";
import type TenantDomain from "#models/tenant_domain";
import type { HeadlineKpis } from "#services/platform/fleet_metrics_service";

/**
 * Wire shapes for the control-plane tenant endpoints. Plain functions (no Adonis transformer
 * machinery) — platform responses are hand-built `{ data }` envelopes. Money/usage values are raw
 * integers (storage in bytes, revenue in the tenant's currency minor units); the console formats
 * them. Keys are snake_case to match the platform OpenAPI surface.
 */

/** The current-usage counters shown against a plan's limits on the tenant detail screen. */
export interface TenantUsageCounters {
    products: number;
    ordersTotal: number;
    customersTotal: number;
    storageBytes: number;
}

function planSummary(plan: Plan) {
    return { id: Number(plan.id), key: plan.key, name: plan.name };
}

export function toTenantDomain(domain: TenantDomain, cnameTarget?: string | null) {
    return {
        id: Number(domain.id),
        domain: String(domain.domain),
        kind: domain.kind,
        is_primary: domain.isPrimary,
        tls_status: domain.tlsStatus,
        verified_at: domain.verifiedAt?.toISO() ?? null,
        created_at: domain.createdAt.toISO(),
        ...(cnameTarget !== undefined ? { cname_target: cnameTarget } : {}),
    };
}

export function toTenantListItem(tenant: Tenant, primaryDomain: string | null, kpis: HeadlineKpis) {
    return {
        id: Number(tenant.id),
        slug: String(tenant.slug),
        name: tenant.name,
        status: tenant.status,
        db_tier: tenant.dbTier,
        currency_code: tenant.currencyCode,
        primary_domain: primaryDomain,
        plan: planSummary(tenant.plan),
        created_at: tenant.createdAt.toISO(),
        kpis: {
            orders_30d: kpis.orders,
            revenue_30d: kpis.revenue,
            storage_bytes: kpis.storageBytes,
        },
    };
}

export function toTenantDetail(tenant: Tenant, domains: TenantDomain[], usage: TenantUsageCounters) {
    return {
        id: Number(tenant.id),
        slug: String(tenant.slug),
        name: tenant.name,
        status: tenant.status,
        db_tier: tenant.dbTier,
        currency_code: tenant.currencyCode,
        primary_locale: tenant.primaryLocale,
        template_key: tenant.templateKey,
        created_at: tenant.createdAt.toISO(),
        updated_at: tenant.updatedAt.toISO(),
        plan: {
            id: Number(tenant.plan.id),
            key: tenant.plan.key,
            name: tenant.plan.name,
            db_tier: tenant.plan.dbTier,
            limits: tenant.plan.limits ?? {},
        },
        domains: domains.map((d) => toTenantDomain(d)),
        usage: {
            products: usage.products,
            orders_total: usage.ordersTotal,
            customers_total: usage.customersTotal,
            storage_bytes: usage.storageBytes,
        },
    };
}
