import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductCategoryTranslationSchema } from "#database/schema";
import ProductCategory from "#models/product_category";

export default class ProductCategoryTranslation extends ProductCategoryTranslationSchema {
    static table = "product_category_translations";

    @belongsTo(() => ProductCategory, { foreignKey: "categoryId" })
    declare category: BelongsTo<typeof ProductCategory>;
}
