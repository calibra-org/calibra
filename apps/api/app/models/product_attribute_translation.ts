import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductAttributeTranslationSchema } from "#database/schema";
import ProductAttribute from "#models/product_attribute";

export default class ProductAttributeTranslation extends ProductAttributeTranslationSchema {
    static table = "product_attribute_translations";

    @belongsTo(() => ProductAttribute, { foreignKey: "attributeId" })
    declare attribute: BelongsTo<typeof ProductAttribute>;
}
