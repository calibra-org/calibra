import { BaseCommand } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";

/**
 * Backfill resized variants for image media uploaded before the resize pipeline existed (or whose
 * variants were lost). Walks every `image/*` row that has no variants yet, regenerates the
 * thumbnail/medium/large renditions from the on-disk original using the current Media settings, and
 * records the new variants + real dimensions on the row. Idempotent: rows that already carry
 * variants, externally-hosted rows, and rows whose original file is missing are skipped.
 *
 * Run after changing the image-size presets to re-cut existing images, or once to backfill a store
 * seeded before the pipeline shipped: `node ace media:regenerate-variants`.
 */
export default class RegenerateMediaVariants extends BaseCommand {
    static commandName = "media:regenerate-variants";
    static description = "Regenerate thumbnail/medium/large variants for image media missing them";

    static options: CommandOptions = {
        startApp: true,
    };

    async run() {
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
            await row.save();
            processed += 1;
        }

        this.logger.info(
            `Regenerated variants for ${processed} image(s); skipped ${skipped} (already done / external / missing).`,
        );
    }
}
