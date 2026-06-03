import hash from "@adonisjs/core/services/hash";
import { BaseSeeder } from "@adonisjs/lucid/seeders";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import { type BrandingSettingsInput, brandingSettingRows } from "#services/storefront_branding_service";
import { runWithTenant } from "#services/tenant_context";
import { nextNumber } from "#services/tenant_numbering_service";
import { TenantProvisioningService } from "#services/tenant_provisioning_service";

/**
 * Multi-tenant demo seed for `node ace db:seed --connection=postgres_admin`. Seeds global
 * control-plane data (currencies, plans, a platform login), then provisions three demo tenants and
 * gives each its own catalog/customers/orders at varied volumes ("one big, two small" — exercises
 * per-tenant isolation, the bridge/noisy-neighbour story, and per-tenant order numbering).
 *
 * Known dev logins: control-plane `platform@calibra.dev` / `Passw0rd1!`; shop admin for the
 * **aurora** tenant `admin@bulk.calibra.dev` / `Passw0rd1!`.
 *
 * Idempotent: a tenant that already exists (by slug) is skipped, so a re-seed of an existing spin is
 * a no-op for that tenant. The full production-scale bulk dataset (`db:bulk-seed`) is not yet
 * tenant-aware — it remains the explicit single-tenant generator pending its Phase-2 conversion.
 */
/**
 * Each demo tenant gets a distinct brand palette + tagline so the storefront's runtime branding
 * (RULE B) is visibly different per host — Aurora cool/blue, Mehr warm/amber, Kasra bold/violet.
 * Logos stay unset (the storefront renders a per-tenant monogram from the name + accent), exercising
 * the no-logo fallback path; production sets `logo_media_id` through the admin branding editor.
 */
const DEMO_TENANTS = [
    {
        slug: "aurora",
        name: "Aurora",
        ownerEmail: "admin@bulk.calibra.dev",
        sizes: { products: 25, customers: 12, orders: 18 },
        branding: {
            tagline: "روشنایی برای هر روز",
            palette: {
                background: "oklch(99% 0.005 230)",
                foreground: "oklch(20% 0.03 250)",
                muted: "oklch(96% 0.01 230)",
                mutedForeground: "oklch(50% 0.02 250)",
                border: "oklch(90% 0.012 230)",
                accent: "oklch(60% 0.16 230)",
                accentForeground: "oklch(99% 0 0)",
            },
        },
    },
    {
        slug: "mehr",
        name: "Mehr",
        ownerEmail: "admin@mehr.calibra.dev",
        sizes: { products: 6, customers: 4, orders: 5 },
        branding: {
            tagline: "گرمی و مهربانی در هر خرید",
            palette: {
                background: "oklch(98% 0.012 70)",
                foreground: "oklch(22% 0.03 50)",
                muted: "oklch(95% 0.02 70)",
                mutedForeground: "oklch(48% 0.03 50)",
                border: "oklch(89% 0.022 60)",
                accent: "oklch(64% 0.16 45)",
                accentForeground: "oklch(99% 0 0)",
            },
        },
    },
    {
        slug: "kasra",
        name: "Kasra",
        ownerEmail: "admin@kasra.calibra.dev",
        sizes: { products: 5, customers: 3, orders: 4 },
        branding: {
            tagline: "جسارت در سادگی",
            palette: {
                background: "oklch(99% 0.006 300)",
                foreground: "oklch(18% 0.03 300)",
                muted: "oklch(96% 0.012 300)",
                mutedForeground: "oklch(50% 0.03 300)",
                border: "oklch(90% 0.015 300)",
                accent: "oklch(56% 0.2 300)",
                accentForeground: "oklch(99% 0 0)",
            },
        },
    },
] as const;

interface DemoSizes {
    products: number;
    customers: number;
    orders: number;
}

export default class MainSeeder extends BaseSeeder {
    private async runSeeder(seederModule: { default: typeof BaseSeeder }) {
        const SeederClass = seederModule.default;
        const instance = new SeederClass(this.client);
        await instance.run();
    }

    async run() {
        /** Global reference data first — tenants FK currencies + plans; regions are shared (no tenant_id). */
        await this.runSeeder(await import("#database/seed_modules/0013_currencies_seeder"));
        await this.runSeeder(await import("#database/seed_modules/0000_platform_seeder"));
        const { default: FoundationSeeder } = await import("#database/seed_modules/0001_foundation_seeder");
        await new FoundationSeeder(this.client).seedGlobalReference();

        const provisioning = new TenantProvisioningService();
        const admin = db.connection("postgres_admin");

        for (const tenant of DEMO_TENANTS) {
            const existing = await admin.from("tenants").where("slug", tenant.slug).first();
            const tenantId = existing
                ? Number(existing.id)
                : (
                      await provisioning.provision({
                          slug: tenant.slug,
                          name: tenant.name,
                          planKey: "starter",
                          currencyCode: "IRR",
                          ownerEmail: tenant.ownerEmail,
                          ownerPassword: "Passw0rd1!",
                          branding: tenant.branding,
                      })
                  ).id;
            if (!existing) {
                await this.seedTenantDemo(tenantId, tenant.sizes);
            }
            /** Branding is upserted unconditionally so spins provisioned before it gain it on re-seed. */
            await this.ensureBranding(admin, tenantId, tenant.name, tenant.branding);
        }
    }

    /**
     * Idempotently upsert a demo tenant's branding settings (RULE B). Runs on the admin connection
     * with the GUC set so RLS resolves the tenant; `onConflict` keeps a re-seed a no-op for unchanged
     * rows. Separate from provisioning so an existing tenant (skipped above) still gets branding.
     */
    private async ensureBranding(
        admin: ReturnType<typeof db.connection>,
        tenantId: number,
        name: string,
        branding: BrandingSettingsInput,
    ): Promise<void> {
        const now = DateTime.utc().toSQL()!;
        await admin.transaction(async (trx) => {
            await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenantId)]);
            for (const row of brandingSettingRows(branding, name)) {
                await trx
                    .table("settings")
                    .insert({
                        tenant_id: tenantId,
                        group_key: "branding",
                        key: row.key,
                        value: JSON.stringify(row.value),
                        type: row.type,
                        created_at: now,
                        updated_at: now,
                    })
                    .onConflict(["tenant_id", "group_key", "key"])
                    .merge(["value", "type", "updated_at"]);
            }
        });
    }

    /**
     * Seeds one tenant's catalog/customers/orders inside its RLS context so the numbering service and
     * any model hooks resolve the right tenant. Runs on the admin connection (BYPASSRLS) but sets the
     * GUC so per-tenant order numbers restart at 1000 for every shop.
     */
    private async seedTenantDemo(tenantId: number, sizes: DemoSizes): Promise<void> {
        const passwordHash = await hash.make("Passw0rd1!");
        await db.connection("postgres_admin").transaction(async (trx) => {
            await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenantId)]);
            await runWithTenant(BigInt(tenantId), trx, async () => {
                const now = DateTime.utc().toSQL()!;

                const customerIds: number[] = [];
                for (let i = 1; i <= sizes.customers; i += 1) {
                    const userRows = await trx
                        .table("users")
                        .insert({
                            tenant_id: tenantId,
                            email: `customer${i}@${tenantId}.demo.test`,
                            password_hash: passwordHash,
                            role: "customer",
                            locale: "fa",
                            created_at: now,
                            updated_at: now,
                        })
                        .returning(["id"]);
                    const customerRows = await trx
                        .table("customers")
                        .insert({
                            tenant_id: tenantId,
                            user_id: Number(userRows[0].id),
                            first_name: `Customer${i}`,
                            last_name: "Demo",
                            created_at: now,
                            updated_at: now,
                        })
                        .returning(["id"]);
                    customerIds.push(Number(customerRows[0].id));
                }

                const productCount = sizes.products;
                for (let i = 1; i <= productCount; i += 1) {
                    const productRows = await trx
                        .table("products")
                        .insert({ tenant_id: tenantId, sku: `SKU-${i}`, created_at: now, updated_at: now })
                        .returning(["id"]);
                    await trx.table("product_translations").insert({
                        tenant_id: tenantId,
                        product_id: Number(productRows[0].id),
                        locale: "fa",
                        name: `محصول ${i}`,
                        slug: `product-${i}`,
                    });
                }

                for (let i = 0; i < sizes.orders; i += 1) {
                    const orderNumber = await nextNumber("order");
                    const orderRows = await trx
                        .table("orders")
                        .insert({
                            tenant_id: tenantId,
                            order_number: orderNumber,
                            customer_id: customerIds[i % customerIds.length] ?? null,
                            created_at: now,
                            updated_at: now,
                        })
                        .returning(["id"]);
                    const orderId = Number(orderRows[0].id);
                    await trx.table("order_line_items").insert({
                        tenant_id: tenantId,
                        order_id: orderId,
                        name_snapshot: `محصول ${(i % productCount) + 1}`,
                    });
                    await trx.table("order_status_history").insert({
                        tenant_id: tenantId,
                        order_id: orderId,
                        to_status: "pending",
                    });
                }
            });
        });
    }
}
