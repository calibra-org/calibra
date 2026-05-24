import { belongsTo, column } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductImportErrorSchema } from "#database/schema";
import type { ProductImportErrorCode, ProductImportErrorSeverity } from "#enums/product_import";
import ProductImport from "#models/product_import";

/**
 * `ProductImportError` — one row per failed (or skipped-with-warning) CSV row. Lives in the DB
 * (not just the on-disk error CSV) so the Step 4 error panel can render inline-editable rows and
 * the retry endpoint can target a specific failure by `id`.
 */
export default class ProductImportError extends ProductImportErrorSchema {
    static table = "product_import_errors";

    @column({ serializeAs: "code" })
    declare code: ProductImportErrorCode;

    @column({ serializeAs: "severity" })
    declare severity: ProductImportErrorSeverity;

    @belongsTo(() => ProductImport, { foreignKey: "importId" })
    declare import: BelongsTo<typeof ProductImport>;
}
