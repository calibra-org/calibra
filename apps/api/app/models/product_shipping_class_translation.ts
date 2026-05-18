import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductShippingClassTranslationSchema } from "#database/schema";
import ProductShippingClass from "#models/product_shipping_class";

export default class ProductShippingClassTranslation extends ProductShippingClassTranslationSchema {
    static table = "product_shipping_class_translations";

    @belongsTo(() => ProductShippingClass, { foreignKey: "shippingClassId" })
    declare shippingClass: BelongsTo<typeof ProductShippingClass>;
}
