import { belongsTo, hasMany } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";

import { ProductAttributeTermSchema } from "#database/schema";
import ProductAttribute from "#models/product_attribute";
import ProductAttributeTermTranslation from "#models/product_attribute_term_translation";

export default class ProductAttributeTerm extends ProductAttributeTermSchema {
    static table = "product_attribute_terms";

    @belongsTo(() => ProductAttribute, { foreignKey: "attributeId" })
    declare attribute: BelongsTo<typeof ProductAttribute>;

    @hasMany(() => ProductAttributeTermTranslation, { foreignKey: "termId" })
    declare translations: HasMany<typeof ProductAttributeTermTranslation>;
}
