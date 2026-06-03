import { BaseCommand, flags } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";

/**
 * Backfill resized variants for image media uploaded before the resize pipeline existed (or whose
 * variants were lost). Walks every `image/*` row that has no variants yet, regenerates the
 * thumbnail/medium/large renditions from the on-disk original using the current Media settings, and
 * records the new variants + real dimensions on the row. Idempotent: rows that already carry
 * variants, externally-hosted rows, and rows whose original file is missing are skipped.
 *
 * **Runs per-tenant.** Media is tenant-scoped (RLS + per-tenant `media` settings), and the command
 * has no request context. Tenant ids are discovered on `postgres_admin` (BYPASSRLS), then each
 * tenant's scan runs on the default (`calibra_app`) connection in a transaction that sets the
 * `app.current_tenant` GUC (`SET LOCAL` via `set_config(..., true)`), inside `runWithTenant`. The
 * body therefore rides the fail-closed runtime role exactly like a request — RLS scopes
 * `Media.query()` to that tenant and `SettingsService.all("media")` resolves its presets (a body on
 * `postgres_admin` would re-scan every tenant's media on each iteration).
 *
 *   node ace media:regenerate-variants                 # every tenant
 *   node ace media:regenerate-variants --tenant=100000 # one shop
 */
export default class RegenerateMediaVariants extends BaseCommand {
    static commandName = "media:regenerate-variants";
    static description = "Regenerate thumbnail/medium/large variants for image media missing them (per-tenant)";

    static options: CommandOptions = {
        startApp: true,
    };

    @flags.number({ description: "Restrict the backfill to a single tenant id. Defaults to every tenant.", alias: "t" })
    declare tenant?: number;

    async run() {
        const { forEachTenant } = await import("#services/tenant_runner");

        let totalProcessed = 0;
        let totalSkipped = 0;
        const ids = await forEachTenant(async (tenantId) => {
            const { processed, skipped } = await this.regenerateForTenant();
            totalProcessed += processed;
            totalSkipped += skipped;
            this.logger.info(`tenant ${tenantId}: regenerated ${processed}, skipped ${skipped}`);
        }, this.tenant);

        if (ids.length === 0) {
            this.logger.warning("No tenants resolved — nothing to regenerate.");
            return;
        }

        this.logger.info(
            `Done across ${ids.length} tenant(s): regenerated ${totalProcessed} image(s); skipped ${totalSkipped} (already done / external / missing).`,
        );
    }

    /**
     * Scan + regenerate the active tenant's image media. Runs inside that tenant's `runWithTenant`
     * scope, so `Media.query()` rides the GUC-bearing transaction; each written row is explicitly
     * bound to that transaction so the UPDATE rides it too (a loaded instance does not inherit the
     * query's client for subsequent `save()`).
     */
    private async regenerateForTenant(): Promise<{ processed: number; skipped: number }> {
        const { currentTrx } = await import("#services/tenant_context");
        const Media = (await import("#models/media")).default;
        const { regenerateVariants } = await import("#services/media_storage");
        const { toMediaUploadConfig } = await import("#transformers/media_settings_transformer");
        const { default: SettingsService } = await import("#services/settings_service");

        const { variants } = toMediaUploadConfig(await new SettingsService().all("media"));
        const rows = await Media.query().where("kind", "image");
        let processed = 0;
        let skipped = 0;

        for (const row of rows) {
            const hasVariants =
                row.attributes !== null &&
                typeof row.attributes === "object" &&
                "variants" in row.attributes &&
                Object.keys((row.attributes as { variants?: object }).variants ?? {}).length > 0;
            if (hasVariants) {
                skipped += 1;
                continue;
            }

            const result = await regenerateVariants(row.url, variants);
            if (result === null) {
                skipped += 1;
                continue;
            }

            row.width = result.width;
            row.height = result.height;
            row.attributes = { ...(row.attributes as object), variants: result.variants };
            row.useTransaction(currentTrx());
            await row.save();
            processed += 1;
        }

        return { processed, skipped };
    }
}
