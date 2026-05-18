import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductBrandTranslationSchema } from "#database/schema";
import ProductBrand from "#models/product_brand";

export default class ProductBrandTranslation extends ProductBrandTranslationSchema {
    static table = "product_brand_translations";

    @belongsTo(() => ProductBrand, { foreignKey: "brandId" })
    declare brand: BelongsTo<typeof ProductBrand>;
}
