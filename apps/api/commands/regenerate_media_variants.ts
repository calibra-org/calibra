import { BaseCommand, flags } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";

/**
 * Backfill resized variants for image media uploaded before the resize pipeline existed (or whose
 * variants were lost). Walks every `image/*` row that has no variants yet, regenerates the
 * thumbnail/medium/large renditions from the on-disk original using the current Media settings, and
 * records the new variants + real dimensions on the row. Idempotent: rows that already carry
 * variants, externally-hosted rows, and rows whose original file is missing are skipped.
 *
 * **Runs per-tenant.** Media is tenant-scoped (RLS + per-tenant `media` settings), and the worker
 * connects with no request context, so this command mirrors `db:bulk-seed`: it opens a
 * `postgres_admin` transaction per tenant, sets the `app.current_tenant` GUC (`SET LOCAL` via
 * `set_config(..., true)`), and runs the scan inside `runWithTenant` so `Media.query()` is scoped to
 * that tenant and `SettingsService.all("media")` resolves the tenant's presets.
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
        const { default: db } = await import("@adonisjs/lucid/services/db");
        const { runWithTenant } = await import("#services/tenant_context");

        const admin = db.connection("postgres_admin");
        const tenantIds = await this.resolveTenantIds(admin);
        if (tenantIds.length === 0) {
            this.logger.warning("No tenants resolved — nothing to regenerate.");
            return;
        }

        let totalProcessed = 0;
        let totalSkipped = 0;
        for (const tenantId of tenantIds) {
            await admin.transaction(async (trx) => {
                await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenantId)]);
                const { processed, skipped } = await runWithTenant(BigInt(tenantId), trx, () => this.regenerateForTenant(trx));
                totalProcessed += processed;
                totalSkipped += skipped;
                this.logger.info(`tenant ${tenantId}: regenerated ${processed}, skipped ${skipped}`);
            });
        }

        this.logger.info(
            `Done across ${tenantIds.length} tenant(s): regenerated ${totalProcessed} image(s); skipped ${totalSkipped} (already done / external / missing).`,
        );
    }

    /** The tenant ids to process — the single `--tenant` target, or every tenant on the admin connection. */
    private async resolveTenantIds(
        admin: ReturnType<typeof import("@adonisjs/lucid/services/db")["default"]["connection"]>,
    ): Promise<number[]> {
        if (this.tenant !== undefined) {
            return [this.tenant];
        }
        const rows = (await admin.from("tenants").whereNull("deleted_at").orderBy("id", "asc").select("id")) as Array<{
            id: number | string;
        }>;
        return rows.map((row) => Number(row.id));
    }

    /**
     * Scan + regenerate one tenant's image media. Runs inside that tenant's `runWithTenant` scope, so
     * `Media.query()` rides the GUC-bearing transaction; each written row is explicitly bound to the
     * same transaction so the UPDATE rides it too (a loaded instance does not inherit the query's
     * client for subsequent `save()`).
     */
    private async regenerateForTenant(trx: TransactionClientContract): Promise<{ processed: number; skipped: number }> {
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
            row.useTransaction(trx);
            await row.save();
            processed += 1;
        }

        return { processed, skipped };
    }
}
