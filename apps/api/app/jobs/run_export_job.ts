import { Job } from "@adonisjs/queue";

import { type RunExportOptions, runExport } from "#services/product_export/export_runner";

/**
 * Thin shell around {@link runExport} so the exporter can run on a background worker. Same
 * retry posture as {@link RunImportJob}: 0 retries, 1h timeout. A partial export leaves the
 * `product_exports` row in `failed` and the wizard offers a re-run.
 */
export default class RunExportJob extends Job<RunExportOptions> {
    static options = {
        queue: "exports",
        maxRetries: 0,
        timeout: "1h",
    };

    async execute() {
        await runExport(this.payload);
    }
}
