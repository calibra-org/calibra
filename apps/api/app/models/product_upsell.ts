import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductUpsellSchema } from "#database/schema";
import Product from "#models/product";

export default class ProductUpsell extends ProductUpsellSchema {
    static table = "product_upsells";

    @belongsTo(() => Product, { foreignKey: "productId" })
    declare product: BelongsTo<typeof Product>;

    @belongsTo(() => Product, { foreignKey: "relatedProductId" })
    declare relatedProduct: BelongsTo<typeof Product>;
}
