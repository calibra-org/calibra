import { BaseSeeder } from "@adonisjs/lucid/seeders";

/**
 * Sole entry point for `node ace db:seed`. Lucid auto-discovers seeders from `database/seeders/`
 * and runs them in lexical order; only this orchestrator lives in that directory. The per-domain
 * seed modules live under `database/seed_modules/` so Lucid never tries to load them as
 * standalone seeders and the run output stays free of "ignored — disabled in environment" noise.
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
        await this.runSeeder(await import("#database/seed_modules/0010_bulk_dataset_seeder"));
        await this.runSeeder(await import("#database/seed_modules/0006_coupons_demo_seeder"));
    }
}
