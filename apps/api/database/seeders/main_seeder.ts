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

        /**
         * Small demo dataset for dev + tests: 100 products / 50 users (+ the FIXED_ADMINS roster)
         * with derived orders + reviews. Completes in ~2 seconds against the dev compose Postgres.
         * For realistic-scale data, run `node ace db:bulk-seed` explicitly.
         */
        const { default: BulkDatasetSeeder } = await import("#database/seed_modules/0010_bulk_dataset_seeder");
        const bulk = new BulkDatasetSeeder(this.client);
        bulk.setOptions({ products: 100, users: 50 });
        await bulk.run();

        await this.runSeeder(await import("#database/seed_modules/0006_coupons_demo_seeder"));
    }
}
