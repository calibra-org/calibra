import { BaseSeeder } from "@adonisjs/lucid/seeders";

/**
 * Sole entry point for `node ace db:seed`. Lucid auto-discovers seeders from `database/seeders/`
 * and runs them in lexical order; only this orchestrator lives in that directory. The per-domain
 * seed modules live under `database/seed_modules/` so Lucid never tries to load them as
 * standalone seeders and the run output stays free of "ignored — disabled in environment" noise.
 *
 * `MainSeeder` produces a **small demo dataset** — enough rows to exercise every screen, fast
 * enough to run in a few seconds for `pnpm test` and `just up`. The `BulkDatasetSeeder`'s
 * production-scale defaults (100k products / 500k users / derived orders + reviews) are reserved
 * for the explicit `node ace db:bulk-seed` ace command and must NEVER fire during `db:seed`.
 *
 * Add a new dataset by appending one `await this.runSeeder(...)` line below.
 */
export default class MainSeeder extends BaseSeeder {
    private async runSeeder(seederModule: { default: typeof BaseSeeder }) {
        const SeederClass = seederModule.default;
        const instance = new SeederClass(this.client);
        await instance.run();
    }

    async run() {
        await this.runSeeder(await import("#database/seed_modules/0001_foundation_seeder"));
        await this.runSeeder(await import("#database/seed_modules/0013_currencies_seeder"));
        await this.runSeeder(await import("#database/seed_modules/0002_attributes_seeder"));

        /**
         * Demo dataset for dev + tests: 1500 products / 3000 users (+ the FIXED_ADMINS roster) +
         * an explicit **8000 orders** distributed across the last 18 months — overrides the default
         * 20%-of-customers ratio so the analytics dashboard has dense trend lines (≈15 orders/day),
         * the Coupons / Taxes / Returns columns show real volume (the seeder also writes
         * order_tax_lines, order_coupon_lines linked to a 15-coupon BULK_ pool, and order_refunds
         * for refunded + ≈3% of completed orders), and every list page shows multiple pages with
         * meaningful facet counts. Still completes in ~15s on dev Postgres.
         *
         * For production-scale data, run `node ace db:bulk-seed` explicitly.
         */
        const { default: BulkDatasetSeeder } = await import("#database/seed_modules/0010_bulk_dataset_seeder");
        const bulk = new BulkDatasetSeeder(this.client);
        bulk.setOptions({ products: 1500, users: 3000, orders: 8000, reviews: 4800 });
        await bulk.run();

        await this.runSeeder(await import("#database/seed_modules/0006_coupons_demo_seeder"));

        await this.runSeeder(await import("#database/seed_modules/0011_iran_cities_seeder"));

        await this.runSeeder(await import("#database/seed_modules/0012_regional_demo_seeder"));
    }
}
