import { Job } from "@adonisjs/queue";

import { withJobTenantContext } from "#jobs/with_job_tenant_context";
import type { ContentSourceFetchResult, PreparedContentSourceIngestion } from "#services/content/source_ingest_service";
import {
    completeContentSourceIngestion,
    failContentSourceIngestion,
    prepareContentSourceIngestion,
    requestContentSource,
} from "#services/content/source_ingest_service";

export default class IngestContentSourceJob extends Job<{ sourceId: number }> {
    static options = { queue: "content-sources", maxRetries: 1, timeout: "2m" };

    async execute() {
        let prepared: PreparedContentSourceIngestion | null = null;
        await withJobTenantContext("content_sources", this.payload.sourceId, async () => {
            prepared = await prepareContentSourceIngestion(this.payload.sourceId);
        });
        const claimed = prepared;
        if (!claimed) return;

        let fetched: ContentSourceFetchResult;
        try {
            fetched = await requestContentSource(claimed);
        } catch (error) {
            await withJobTenantContext("content_sources", this.payload.sourceId, async () => {
                await failContentSourceIngestion(this.payload.sourceId, error);
            });
            throw error;
        }

        try {
            await withJobTenantContext("content_sources", this.payload.sourceId, async () => {
                await completeContentSourceIngestion(claimed, fetched);
            });
        } catch (error) {
            await withJobTenantContext("content_sources", this.payload.sourceId, async () => {
                await failContentSourceIngestion(this.payload.sourceId, error);
            });
            throw error;
        }
    }
}
