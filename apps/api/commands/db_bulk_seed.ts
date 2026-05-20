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

    async run() {
        const { default: db } = await import("@adonisjs/lucid/services/db");
        const { default: BulkDatasetSeeder } = await import("#database/seed_modules/0010_bulk_dataset_seeder");

        const client = db.connection();
        const instance = new BulkDatasetSeeder(client);
        instance.setOptions({
            ...(this.products !== undefined ? { products: this.products } : {}),
            ...(this.users !== undefined ? { users: this.users } : {}),
            ...(this.orders !== undefined ? { orders: this.orders } : {}),
            ...(this.reviews !== undefined ? { reviews: this.reviews } : {}),
            reset: this.reset,
        });

        const started = Date.now();
        this.logger.info(
            `Bulk seeding: products=${this.products ?? "default"}, users=${this.users ?? "default"}, orders=${this.orders ?? "derived"}, reviews=${this.reviews ?? "derived"}, reset=${this.reset}`,
        );
        await instance.run();
        const elapsed = ((Date.now() - started) / 1000).toFixed(1);
        this.logger.info(`Bulk seed completed in ${elapsed}s.`);
    }
}
