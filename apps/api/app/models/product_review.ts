import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductReviewSchema } from "#database/schema";
import Product from "#models/product";

export default class ProductReview extends ProductReviewSchema {
    static table = "product_reviews";

    @belongsTo(() => Product, { foreignKey: "productId" })
    declare product: BelongsTo<typeof Product>;
}
