import { Job } from "@adonisjs/queue";

import { type RunOptions, runImport } from "#services/product_import/import_runner";

/**
 * Thin shell around {@link runImport} so the importer can run on a background worker. Keeps
 * the business logic in one place; this class only handles serialisation + queue plumbing.
 *
 * Retries are off (`maxRetries: 0`): a partial run leaves an inconsistent counter snapshot on
 * the `product_imports` row that the operator already sees in the wizard, so a silent retry
 * would double-count without giving any feedback. The operator triggers a fresh run instead.
 */
export default class RunImportJob extends Job<RunOptions> {
    static options = {
        queue: "imports",
        maxRetries: 0,
        timeout: "1h",
    };

    async execute() {
        await runImport(this.payload);
    }
}
