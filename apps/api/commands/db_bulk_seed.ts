import { BaseCommand, flags } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";

/**
 * Bulk dataset generator. Runs {@link BulkDatasetSeeder} with caller-controlled volumes.
 *
 * Defaults model a **mature merchant snapshot**: 100,000 products, 500,000 users (+ 20 named
 * admin logins), 100,000 orders (≈20 % of customers ever buy), 60,000 reviews (≈60 % of orders
 * earn one). When `--orders` / `--reviews` aren't passed, the seeder derives them from the
 * resolved customer count, so shrinking `--users` proportionally shrinks the downstream
 * volumes without manual math.
 *
 * The seeder is idempotent and tags every row it inserts (`@bulk.calibra.dev` users, `BULK-*`
 * SKUs) so a second invocation is a no-op. Always opt-in — not chained into the default
 * `db:seed` orchestrator. Reserve for screens that need realistic scale (catalog pagination,
 * dashboard charts, list-view perf tests).
 */
export default class DbBulkSeed extends BaseCommand {
    static commandName = "db:bulk-seed";
    static description = "Generate a realistic Iranian e-commerce dataset (default: 100k products / 500k users / 100k orders).";

    static options: CommandOptions = {
        startApp: true,
    };

    @flags.number({ description: "Number of products to insert. Default 100,000." })
    declare products?: number;

    @flags.number({ description: "Number of users + customers to insert. Default 500,000." })
    declare users?: number;

    @flags.number({ description: "Number of orders to insert. Default: ≈20% of customers." })
    declare orders?: number;

    @flags.number({ description: "Number of product reviews to insert. Default: ≈60% of orders." })
    declare reviews?: number;

    @flags.boolean({
        description: "Drop the previously-seeded bulk rows before inserting (the demo seeders' rows are untouched).",
        default: false,
    })
    declare reset: boolean;

    @flags.number({
        description: "Seed this many tenants (reusing existing tenants oldest-first, provisioning more as needed). Default 1.",
        default: 1,
    })
    declare tenants: number;

    @flags.string({ description: "Database connection to seed on. Use postgres_admin so RLS is bypassed.", alias: "c" })
    declare connection?: string;

    async run() {
        const { default: db } = await import("@adonisjs/lucid/services/db");
        const { default: BulkDatasetSeeder } = await import("#database/seed_modules/0010_bulk_dataset_seeder");
        const { runWithTenant } = await import("#services/tenant_context");

        const connectionName = this.connection ?? "postgres_admin";
        const client = db.connection(connectionName);
        const tenantCount = Math.max(1, this.tenants ?? 1);
        const tenantIds = await this.resolveTenantIds(client, tenantCount);

        this.logger.info(
            `Bulk seeding ${tenantIds.length} tenant(s) [${tenantIds.join(", ")}] on "${connectionName}": ` +
                `products=${this.products ?? "default"}, users=${this.users ?? "default"}, orders=${this.orders ?? "derived"}, reviews=${this.reviews ?? "derived"}, reset=${this.reset}`,
        );

        const started = Date.now();
        for (const tenantId of tenantIds) {
            this.logger.info(`→ tenant ${tenantId}`);
            /**
             * One transaction per tenant: `set_config(..., true)` (≡ SET LOCAL) scopes the GUC so the
             * `tenant_id` column default fills every insert, the per-tenant numbering counters resolve
             * through `currentTrx()`, and a failure rolls back that tenant's whole dataset.
             */
            await client.transaction(async (trx) => {
                await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenantId)]);
                await runWithTenant(BigInt(tenantId), trx, async () => {
                    const instance = new BulkDatasetSeeder(trx);
                    instance.setOptions({
                        ...(this.products !== undefined ? { products: this.products } : {}),
                        ...(this.users !== undefined ? { users: this.users } : {}),
                        ...(this.orders !== undefined ? { orders: this.orders } : {}),
                        ...(this.reviews !== undefined ? { reviews: this.reviews } : {}),
                        reset: this.reset,
                    });
                    await instance.run();
                });
            });
        }
        const elapsed = ((Date.now() - started) / 1000).toFixed(1);
        this.logger.info(`Bulk seed completed for ${tenantIds.length} tenant(s) in ${elapsed}s.`);
    }

    /**
     * Resolve `count` tenant ids to seed: reuse existing tenants (oldest first), provisioning
     * additional `bulk-tenant-N` shops when fewer exist. Provisioning runs on `postgres_admin`.
     */
    private async resolveTenantIds(
        client: ReturnType<typeof import("@adonisjs/lucid/services/db")["default"]["connection"]>,
        count: number,
    ): Promise<number[]> {
        const existing = (await client.from("tenants").select("id").orderBy("id", "asc").limit(count)) as Array<{
            id: number | string;
        }>;
        const ids = existing.map((row) => Number(row.id));
        if (ids.length >= count) {
            return ids.slice(0, count);
        }

        const { TenantProvisioningService } = await import("#services/tenant_provisioning_service");
        const provisioning = new TenantProvisioningService();
        let suffix = 1;
        while (ids.length < count) {
            const slug = `bulk-tenant-${suffix}`;
            suffix += 1;
            const taken = await client.from("tenants").where("slug", slug).first();
            if (taken) continue;
            const result = await provisioning.provision({
                slug,
                name: `Bulk Tenant ${suffix - 1}`,
                planKey: "starter",
                currencyCode: "IRR",
                ownerEmail: `owner@${slug}.calibra.dev`,
                ownerPassword: "Passw0rd1!",
            });
            ids.push(result.id);
        }
        return ids;
    }
}
