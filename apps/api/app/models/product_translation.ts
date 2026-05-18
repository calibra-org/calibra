import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductTranslationSchema } from "#database/schema";
import Product from "#models/product";

export default class ProductTranslation extends ProductTranslationSchema {
    static table = "product_translations";

    @belongsTo(() => Product, { foreignKey: "productId" })
    declare product: BelongsTo<typeof Product>;
}
