import { BaseCommand, flags } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";

/**
 * Bulk dataset generator. Runs {@link BulkDatasetSeeder} with caller-controlled volumes (default
 * 10,000 products / 1,000 users / 5,000 orders). The seeder is idempotent and tags every row it
 * inserts (`@bulk.calibra.dev` users, `BULK-*` SKUs) so a second invocation is a no-op.
 *
 * Always opt-in — not chained into the default `db:seed` orchestrator. Reserve for screens that
 * need realistic scale (catalog pagination, dashboard charts, list-view perf tests).
 */
export default class DbBulkSeed extends BaseCommand {
    static commandName = "db:bulk-seed";
    static description = "Generate a realistic Iranian e-commerce dataset (10k products / 1k users / 5k orders by default).";

    static options: CommandOptions = {
        startApp: true,
    };

    @flags.number({ description: "Number of products to insert.", default: 10_000 })
    declare products: number;

    @flags.number({ description: "Number of users + customers to insert.", default: 1_000 })
    declare users: number;

    @flags.number({ description: "Number of orders to insert.", default: 5_000 })
    declare orders: number;

    @flags.boolean({
        description: "Drop the previously-seeded bulk rows before inserting (the demo seeders' rows are untouched).",
        default: false,
    })
    declare reset: boolean;

    async run() {
        const { default: db } = await import("@adonisjs/lucid/services/db");
        const { default: BulkDatasetSeeder } = await import("#database/seed_modules/0010_bulk_dataset_seeder");

        const client = db.connection();
        const instance = new BulkDatasetSeeder(client);
        instance.setOptions({
            products: this.products,
            users: this.users,
            orders: this.orders,
            reset: this.reset,
        });

        const started = Date.now();
        this.logger.info(
            `Bulk seeding: products=${this.products}, users=${this.users}, orders=${this.orders}, reset=${this.reset}`,
        );
        await instance.run();
        const elapsed = ((Date.now() - started) / 1000).toFixed(1);
        this.logger.info(`Bulk seed completed in ${elapsed}s.`);
    }
}
