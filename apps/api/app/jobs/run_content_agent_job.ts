import { Job } from "@adonisjs/queue";

import { withJobTenantContext } from "#jobs/with_job_tenant_context";
import type { AgentExecutionResult, PreparedAgentExecution } from "#services/content/agent_service";
import { contentAgentService } from "#services/content/agent_service";

export default class RunContentAgentJob extends Job<{ runId: number }> {
    static options = { queue: "content-agents", maxRetries: 1, timeout: "2m" };

    async execute() {
        let prepared: PreparedAgentExecution | null = null;
        await withJobTenantContext("content_agent_runs", this.payload.runId, async () => {
            prepared = await contentAgentService.prepareExecution(this.payload.runId);
        });
        if (!prepared) return;

        let result: AgentExecutionResult;
        try {
            result = await contentAgentService.requestExecution(prepared);
        } catch (error) {
            await withJobTenantContext("content_agent_runs", this.payload.runId, async () => {
                await contentAgentService.failExecution(this.payload.runId, error);
            });
            throw error;
        }

        try {
            await withJobTenantContext("content_agent_runs", this.payload.runId, async () => {
                await contentAgentService.completeExecution(this.payload.runId, result);
            });
        } catch (error) {
            await withJobTenantContext("content_agent_runs", this.payload.runId, async () => {
                await contentAgentService.failExecution(this.payload.runId, error);
            });
            throw error;
        }
    }
}
