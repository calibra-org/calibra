import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import User from "#models/user";
import { runWithTenant } from "#services/tenant_context";

/**
 * Slugs that must never become a tenant — they collide with platform/system subdomains
 * (`admin.calibra.app`, `api.calibra.app`, …) or reserved hostnames.
 */
const RESERVED_SLUGS = new Set([
    "www",
    "admin",
    "api",
    "app",
    "apps",
    "console",
    "dashboard",
    "platform",
    "shops",
    "shop",
    "store",
    "auth",
    "login",
    "static",
    "cdn",
    "assets",
    "media",
    "mail",
    "smtp",
    "ftp",
    "blog",
    "help",
    "support",
    "status",
    "docs",
    "billing",
    "internal",
    "system",
]);

export interface ProvisionInput {
    slug: string;
    name: string;
    planKey: string;
    currencyCode: string;
    ownerEmail?: string | null;
    ownerPhone?: string | null;
    ownerPassword?: string | null;
    /** Hostname suffix for the auto-created subdomain. Defaults to `shops.calibra.app`. */
    domainSuffix?: string;
}

export interface ProvisionResult {
    id: number;
    slug: string;
    ownerUserId: number;
}

/**
 * Creates a tenant end-to-end: the `tenants` row, its primary subdomain, per-tenant defaults (Iran
 * tax class + 9% VAT rate, a fallback shipping zone + flat-rate method, the core `settings` groups,
 * a cash-on-delivery payment gateway), and the owner shop-admin user — all in one `postgres_admin`
 * transaction. Used by the seeder and (Phase 5) the control-plane API.
 *
 * Defaults are seeded inside the tenant's RLS context (`app.current_tenant` set on the transaction)
 * so model-driven inserts stamp `tenant_id` automatically; raw inserts pass it explicitly.
 */
export class TenantProvisioningService {
    static isReservedSlug(slug: string): boolean {
        return RESERVED_SLUGS.has(slug.toLowerCase().trim());
    }

    async provision(input: ProvisionInput): Promise<ProvisionResult> {
        const slug = input.slug.toLowerCase().trim();
        if (TenantProvisioningService.isReservedSlug(slug)) {
            throw new Error(`Tenant slug "${slug}" is reserved.`);
        }
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
            throw new Error(`Tenant slug "${slug}" is invalid (lowercase alphanumerics + single dashes only).`);
        }
        if (!input.ownerEmail && !input.ownerPhone) {
            throw new Error("Tenant owner needs an email or a phone.");
        }

        return db.connection("postgres_admin").transaction(async (trx) => {
            const now = DateTime.utc().toSQL()!;
            const plan = await trx.from("plans").where("key", input.planKey).first();
            if (!plan) {
                throw new Error(`Plan "${input.planKey}" not found — seed plans first.`);
            }

            const tenantRows = await trx
                .table("tenants")
                .insert({
                    slug,
                    name: input.name,
                    status: "active",
                    plan_id: plan.id,
                    db_tier: plan.db_tier,
                    template_key: "default",
                    currency_code: input.currencyCode,
                    primary_locale: "fa",
                    created_at: now,
                    updated_at: now,
                })
                .returning(["id"]);
            const tenantId = Number(tenantRows[0].id);

            const suffix = input.domainSuffix ?? "shops.calibra.app";
            await trx.table("tenant_domains").insert({
                tenant_id: tenantId,
                domain: `${slug}.${suffix}`,
                kind: "subdomain",
                is_primary: true,
                tls_status: "pending",
                created_at: now,
                updated_at: now,
            });

            await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenantId)]);
            await this.seedDefaults(trx, tenantId, now);

            const ownerUserId = await runWithTenant(BigInt(tenantId), trx, async () => {
                const user = new User();
                user.tenantId = tenantId;
                if (input.ownerEmail) user.email = input.ownerEmail.toLowerCase();
                if (input.ownerPhone) user.phone = input.ownerPhone;
                user.passwordHash = input.ownerPassword ?? "ChangeMe123!";
                user.role = "admin";
                user.locale = "fa";
                await user.save();
                return Number(user.id);
            });

            return { id: tenantId, slug, ownerUserId };
        });
    }

    /**
     * Seeds the minimal operational defaults every new shop needs. Raw inserts on the admin
     * transaction with explicit `tenant_id` (the GUC is set, but `calibra_admin` bypasses RLS).
     */
    private async seedDefaults(trx: TransactionClientContract, tenantId: number, now: string): Promise<void> {
        const taxRows = await trx
            .table("tax_classes")
            .insert({ tenant_id: tenantId, slug: "standard", name: "Standard", created_at: now, updated_at: now })
            .returning(["id"]);
        await trx.table("tax_rates").insert({
            tenant_id: tenantId,
            tax_class_id: Number(taxRows[0].id),
            rate: 9,
            label: "VAT",
            created_at: now,
            updated_at: now,
        });

        const zoneRows = await trx
            .table("shipping_zones")
            .insert({ tenant_id: tenantId, name: "Iran", is_fallback: true, created_at: now, updated_at: now })
            .returning(["id"]);
        const methodRows = await trx
            .table("shipping_methods")
            .insert({
                tenant_id: tenantId,
                code: "flat_rate",
                title_default: "Flat rate",
                created_at: now,
                updated_at: now,
            })
            .returning(["id"]);
        await trx.table("shipping_zone_methods").insert({
            tenant_id: tenantId,
            zone_id: Number(zoneRows[0].id),
            method_id: Number(methodRows[0].id),
            created_at: now,
            updated_at: now,
        });

        await trx.table("payment_gateways").insert({
            tenant_id: tenantId,
            code: "cod",
            enabled: true,
            created_at: now,
            updated_at: now,
        });

        const settings = [
            { group_key: "general", key: "shop_name", value: JSON.stringify("Shop"), type: "string" },
            { group_key: "general", key: "primary_locale", value: JSON.stringify("fa"), type: "string" },
        ];
        for (const setting of settings) {
            await trx.table("settings").insert({
                tenant_id: tenantId,
                group_key: setting.group_key,
                key: setting.key,
                value: setting.value,
                type: setting.type,
                created_at: now,
                updated_at: now,
            });
        }
    }
}
