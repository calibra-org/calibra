import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductCustomAttributeSchema } from "#database/schema";
import Product from "#models/product";

/**
 * Per-product custom attribute row — e.g. an operator-typed "Material: cotton | polyester"
 * that exists only on this product and has no place in the global taxonomy. The opposite
 * shape from {@link ProductAttributeLink}: name + values live inline (jsonb `values`), there
 * is no shared term table, and the row can never feed variation generation (the cartesian
 * builder keys off `product_attribute_links` only).
 */
export default class ProductCustomAttribute extends ProductCustomAttributeSchema {
    static table = "product_custom_attributes";

    @belongsTo(() => Product, { foreignKey: "productId" })
    declare product: BelongsTo<typeof Product>;
}
