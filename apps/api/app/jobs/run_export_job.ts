import { Job } from "@adonisjs/queue";

import { withJobTenantContext } from "#jobs/with_job_tenant_context";
import { recordQueueJobOutcome } from "#services/metrics/domain_metrics";
import { type RunExportOptions, runExport } from "#services/product_export/export_runner";

/**
 * Thin shell around {@link runExport} so the exporter can run on a background worker. Same
 * retry posture as {@link RunImportJob}: 0 retries, 1h timeout. A partial export leaves the
 * `product_exports` row in `failed` and the wizard offers a re-run. Wall-clock + outcome are
 * recorded for the queue metrics surface.
 */
export default class RunExportJob extends Job<RunExportOptions> {
    static options = {
        queue: "exports",
        maxRetries: 0,
        timeout: "1h",
    };

    async execute() {
        const startedAt = process.hrtime.bigint();
        try {
            await withJobTenantContext("product_exports", this.payload.exportId, () => runExport(this.payload));
            recordQueueJobOutcome("exports", "completed", Number(process.hrtime.bigint() - startedAt) / 1e9);
        } catch (err) {
            recordQueueJobOutcome("exports", "failed", Number(process.hrtime.bigint() - startedAt) / 1e9);
            throw err;
        }
    }
}
