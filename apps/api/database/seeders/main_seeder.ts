import { BaseSeeder } from "@adonisjs/lucid/seeders";

/**
 * Orchestrator that invokes per-phase seeders in order. `db:seed` is configured to discover every
 * file under `database/seeders/`; per-phase seeders set `static environment` to a sentinel so the
 * auto-discovery step ignores them and only this file runs end-to-end.
 *
 * Subsequent phases append a single `await this.run(...)` line below.
 */
export default class MainSeeder extends BaseSeeder {
    private async runSeeder(seederModule: { default: typeof BaseSeeder }) {
        const SeederClass = seederModule.default;
        const instance = new SeederClass(this.client);
        await instance.run();
    }

    async run() {
        await this.runSeeder(await import("./phases/0001_foundation_seeder.js"));
        await this.runSeeder(await import("./phases/0003_customers_demo_seeder.js"));
    }
}
