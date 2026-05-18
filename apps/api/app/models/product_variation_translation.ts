import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductVariationTranslationSchema } from "#database/schema";
import ProductVariation from "#models/product_variation";

export default class ProductVariationTranslation extends ProductVariationTranslationSchema {
    static table = "product_variation_translations";

    @belongsTo(() => ProductVariation, { foreignKey: "variationId" })
    declare variation: BelongsTo<typeof ProductVariation>;
}
