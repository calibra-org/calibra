import app from "@adonisjs/core/services/app";
import { BaseSeeder } from "@adonisjs/lucid/seeders";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import AttributesSeeder from "#database/seed_modules/0002_attributes_seeder";
import BulkDatasetSeeder, { type BulkSeederOptions } from "#database/seed_modules/0010_bulk_dataset_seeder";
import { type BrandingSettingsInput, brandingSettingRows } from "#services/storefront_branding_service";
import { runWithTenant } from "#services/tenant_context";
import { TenantProvisioningService } from "#services/tenant_provisioning_service";

/**
 * Multi-tenant demo seed for `node ace db:seed --connection=postgres_admin`. Seeds global
 * control-plane data (currencies, plans, a platform login), then provisions three demo tenants and
 * gives each a **realistic, fully-populated** catalog/customers/orders via {@link BulkDatasetSeeder}
 * — the same generator behind `db:bulk-seed`, run per-tenant at demo volumes. Every tenant gets the
 * nested Digikala-style category tree, brands, tags, ~200+ products (simple/variable with variations,
 * inventory, images, fa+en translations, category/brand/tag links), hundreds of customers with
 * addresses + IR profiles, 500+ orders with consistent totals/statuses/refunds, and reviews. Volumes
 * vary per tenant ("one big, two small") to exercise per-tenant isolation and numbering.
 *
 * Known dev logins: control-plane `platform@calibra.dev` / `Passw0rd1!`; shop admins
 * `admin@bulk.calibra.dev` (works on every tenant — part of the seeded admin roster) plus the
 * per-tenant owners `admin@mehr.calibra.dev` / `admin@kasra.calibra.dev`, all `Passw0rd1!`.
 *
 * Idempotent: per-tenant dataset seeding counts existing bulk rows and inserts only the delta, so a
 * re-seed of an existing spin tops it up to target without duplicating. Attributes are seeded
 * per-tenant first so variable products get real variation axes.
 */
/**
 * Each demo tenant gets a distinct brand palette + tagline so the storefront's runtime branding
 * (RULE B) is visibly different per host — Aurora cool/blue, Mehr warm/amber, Kasra bold/violet.
 * Logos stay unset (the storefront renders a per-tenant monogram from the name + accent), exercising
 * the no-logo fallback path; production sets `logo_media_id` through the admin branding editor.
 *
 * `volumes` are passed straight to {@link BulkDatasetSeeder}: `products` / `users` (= customers) are
 * explicit, `orders` and `reviews` are explicit so every shop clears the demo targets (≥500 orders,
 * ~200 products) regardless of the customer count. "One big, two small" keeps Aurora the heaviest.
 */
const DEMO_TENANTS: ReadonlyArray<{
    slug: string;
    name: string;
    ownerEmail: string;
    volumes: BulkSeederOptions;
    branding: BrandingSettingsInput;
}> = [
    {
        slug: "aurora",
        name: "Aurora",
        ownerEmail: "admin@bulk.calibra.dev",
        volumes: { products: 240, users: 400, orders: 650, reviews: 400 },
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
        volumes: { products: 200, users: 320, orders: 520, reviews: 320 },
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
        volumes: { products: 200, users: 320, orders: 520, reviews: 320 },
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
];

/**
 * Test-env volumes (`NODE_ENV=test`). Small + `images: false` so `db:seed` stays fast under Japa —
 * `seeders.spec` / `seeders_demo.spec` re-run `MainSeeder` in every `each.setup`, and the full
 * sharp image pass at dev volumes would blow the CI shard budget. Per-tenant counts stay distinct so
 * the per-tenant catalog spec can still assert isolation. Keep `seeders_demo.spec`'s expected counts
 * in lockstep with these.
 */
const TEST_VOLUMES: Record<string, BulkSeederOptions> = {
    aurora: { products: 8, users: 6, orders: 6, reviews: 3, images: false },
    mehr: { products: 6, users: 5, orders: 5, reviews: 2, images: false },
    kasra: { products: 5, users: 4, orders: 4, reviews: 2, images: false },
};

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
            /** Branding is upserted unconditionally so spins provisioned before it gain it on re-seed. */
            await this.ensureBranding(admin, tenantId, tenant.name, tenant.branding);
            /**
             * Realistic dataset, unconditional + idempotent: the bulk generator counts existing
             * bulk rows for this tenant and inserts only the delta, so re-seeding an existing spin
             * tops it up to target rather than duplicating.
             */
            await this.seedTenantDataset(tenantId, app.inTest ? (TEST_VOLUMES[tenant.slug] ?? tenant.volumes) : tenant.volumes);
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
     * Seeds one tenant's full realistic dataset inside its RLS context. Runs on the admin connection
     * (BYPASSRLS) but sets the `app.current_tenant` GUC inside one transaction so the `tenant_id`
     * column default fills every insert, per-tenant numbering counters resolve through `currentTrx()`,
     * and a failure rolls back that tenant's whole dataset.
     *
     * Order matters: {@link AttributesSeeder} first so the per-tenant attribute taxonomy
     * (Color · Size · …) exists for {@link BulkDatasetSeeder} to pin variable-product variations
     * against; then the bulk generator builds the catalog, customers, orders, and reviews.
     */
    private async seedTenantDataset(tenantId: number, volumes: BulkSeederOptions): Promise<void> {
        await db.connection("postgres_admin").transaction(async (trx) => {
            await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenantId)]);
            await runWithTenant(BigInt(tenantId), trx, async () => {
                await new AttributesSeeder(trx).run();
                await new BulkDatasetSeeder(trx).setOptions(volumes).run();
            });
        });
    }
}
