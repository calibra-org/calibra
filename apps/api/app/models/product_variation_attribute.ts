import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductVariationAttributeSchema } from "#database/schema";
import ProductAttribute from "#models/product_attribute";
import ProductAttributeTerm from "#models/product_attribute_term";
import ProductVariation from "#models/product_variation";

export default class ProductVariationAttribute extends ProductVariationAttributeSchema {
    static table = "product_variation_attributes";

    @belongsTo(() => ProductVariation, { foreignKey: "variationId" })
    declare variation: BelongsTo<typeof ProductVariation>;

    @belongsTo(() => ProductAttribute, { foreignKey: "attributeId" })
    declare attribute: BelongsTo<typeof ProductAttribute>;

    @belongsTo(() => ProductAttributeTerm, { foreignKey: "termId" })
    declare term: BelongsTo<typeof ProductAttributeTerm>;
}
