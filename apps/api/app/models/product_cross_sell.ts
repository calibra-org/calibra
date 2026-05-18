import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductCrossSellSchema } from "#database/schema";
import Product from "#models/product";

export default class ProductCrossSell extends ProductCrossSellSchema {
    static table = "product_cross_sells";

    @belongsTo(() => Product, { foreignKey: "productId" })
    declare product: BelongsTo<typeof Product>;

    @belongsTo(() => Product, { foreignKey: "relatedProductId" })
    declare relatedProduct: BelongsTo<typeof Product>;
}
