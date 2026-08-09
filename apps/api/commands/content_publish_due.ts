import { BaseCommand } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";

/** Publish approved scheduled content for every tenant. Intended for a once-per-minute cron. */
export default class ContentPublishDue extends BaseCommand {
    static commandName = "content:publish-due";
    static description = "Publish tenant content whose scheduled time has arrived";
    static options: CommandOptions = { startApp: true };

    async run() {
        const { contentService } = await import("#services/content/content_service");
        const { forEachTenant } = await import("#services/tenant_runner");
        let total = 0;
        const tenants = await forEachTenant(async (tenantId) => {
            const count = await contentService.publishDue();
            total += count;
            if (count > 0) this.logger.info(`tenant ${tenantId}: published ${count} scheduled content item(s)`);
        });
        this.logger.info(`Published ${total} content item(s) across ${tenants.length} tenant(s).`);
    }
}
