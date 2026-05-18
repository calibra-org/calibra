import { hasMany } from "@adonisjs/lucid/orm";
import type { HasMany } from "@adonisjs/lucid/types/relations";

import { ProductShippingClassSchema } from "#database/schema";
import ProductShippingClassTranslation from "#models/product_shipping_class_translation";

export default class ProductShippingClass extends ProductShippingClassSchema {
    static table = "product_shipping_classes";

    @hasMany(() => ProductShippingClassTranslation, { foreignKey: "shippingClassId" })
    declare translations: HasMany<typeof ProductShippingClassTranslation>;
}
