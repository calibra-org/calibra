import { belongsTo, column } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductImportChangeSchema } from "#database/schema";
import type { ProductImportChangeOp } from "#enums/product_import";
import Product from "#models/product";
import ProductImport from "#models/product_import";

/**
 * `ProductImportChange` — per-product, per-field diff captured at commit. Drives the import history
 * detail view ("why did saf-001 change price last Tuesday?" → click the import row, see every
 * field that moved) and the rollback restore-from-snapshot pass.
 */
export default class ProductImportChange extends ProductImportChangeSchema {
    static table = "product_import_changes";

    @column({ serializeAs: "op" })
    declare op: ProductImportChangeOp;

    @belongsTo(() => ProductImport, { foreignKey: "importId" })
    declare import: BelongsTo<typeof ProductImport>;

    @belongsTo(() => Product, { foreignKey: "productId" })
    declare product: BelongsTo<typeof Product>;
}
