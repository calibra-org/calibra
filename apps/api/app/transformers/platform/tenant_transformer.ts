import type Plan from "#models/plan";
import type Tenant from "#models/tenant";
import type TenantDomain from "#models/tenant_domain";
import { ownershipRecordName } from "#services/domain_verification_service";
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

/**
 * The CNAME target a custom domain must point at — the tenant's primary subdomain, falling back to
 * the conventional `<slug>.shops.calibra.app`. Shared by the attach/recheck responses and the
 * tenant-detail domains list so the displayed routing record is consistent.
 */
export function cnameTargetForTenant(tenant: Tenant, domains: TenantDomain[]): string {
    const primary = domains.find((d) => d.isPrimary && d.kind === "subdomain") ?? domains.find((d) => d.isPrimary);
    return primary ? String(primary.domain) : `${String(tenant.slug)}.shops.calibra.app`;
}

/**
 * The canonical custom-domain wire shape (`DomainStatus` in the platform OpenAPI surface). Carries
 * both verification gates, the exact DNS records the operator must publish (TXT for ownership, CNAME
 * for routing), the last cert error, and a `simulated` flag set when a local DNS-simulated recheck
 * drove the result (the UI badges it "simulated (local)"). Used identically by attach, recheck, and
 * the tenant-detail domains list so the console renders one shape everywhere.
 */
export function toDomainStatus(domain: TenantDomain, cnameTarget: string | null, simulated = false) {
    return {
        id: Number(domain.id),
        domain: String(domain.domain),
        kind: domain.kind,
        is_primary: domain.isPrimary,
        tls_status: domain.tlsStatus,
        ownership_verified: domain.ownershipVerifiedAt !== null,
        routing_verified: domain.routingVerifiedAt !== null,
        ownership_verified_at: domain.ownershipVerifiedAt?.toISO() ?? null,
        routing_verified_at: domain.routingVerifiedAt?.toISO() ?? null,
        cert_last_error: domain.certLastError ?? null,
        cname_target: cnameTarget,
        ownership: {
            record_type: "TXT",
            record_name: ownershipRecordName(String(domain.domain)),
            record_value: domain.ownershipToken ?? null,
        },
        routing: {
            record_type: "CNAME",
            record_name: String(domain.domain),
            record_value: cnameTarget,
        },
        simulated,
        verified_at: domain.verifiedAt?.toISO() ?? null,
        created_at: domain.createdAt.toISO(),
    };
}

/** Back-compat alias — the tenant-detail domains list and attach response both emit `DomainStatus`. */
export function toTenantDomain(domain: TenantDomain, cnameTarget: string | null = null) {
    return toDomainStatus(domain, cnameTarget);
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
        /** 14-day daily revenue (oldest → newest, minor units) for the inline row sparkline. */
        spark: kpis.spark,
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
        domains: domains.map((d) => toTenantDomain(d, cnameTargetForTenant(tenant, domains))),
        usage: {
            products: usage.products,
            orders_total: usage.ordersTotal,
            customers_total: usage.customersTotal,
            storage_bytes: usage.storageBytes,
        },
    };
}
