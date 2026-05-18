import { hasMany } from "@adonisjs/lucid/orm";
import type { HasMany } from "@adonisjs/lucid/types/relations";

import { ProductAttributeSchema } from "#database/schema";
import ProductAttributeTerm from "#models/product_attribute_term";
import ProductAttributeTranslation from "#models/product_attribute_translation";

export default class ProductAttribute extends ProductAttributeSchema {
    static table = "product_attributes";

    @hasMany(() => ProductAttributeTranslation, { foreignKey: "attributeId" })
    declare translations: HasMany<typeof ProductAttributeTranslation>;

    @hasMany(() => ProductAttributeTerm, { foreignKey: "attributeId" })
    declare terms: HasMany<typeof ProductAttributeTerm>;
}
