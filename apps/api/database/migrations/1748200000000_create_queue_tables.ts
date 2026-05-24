import { BaseSchema } from "@adonisjs/lucid/schema";
import { QueueSchemaService } from "@adonisjs/queue";

/**
 * @adonisjs/queue's database driver expects two tables: `jobs` (the work queue) and `schedules`
 * (cron entries). `QueueSchemaService` builds them with the right indexes for the worker's
 * polling query — we just call into it from `up` / `down`. No hand-maintained DDL, so future
 * version bumps of the queue package pick up schema migrations transparently.
 */
export default class extends BaseSchema {
    async up() {
        const schemaService = new QueueSchemaService(this.db.getWriteClient());
        await schemaService.createJobsTable();
        await schemaService.createSchedulesTable();
    }

    async down() {
        const schemaService = new QueueSchemaService(this.db.getWriteClient());
        await schemaService.dropSchedulesTable();
        await schemaService.dropJobsTable();
    }
}
