import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductDownloadSchema } from "#database/schema";
import Media from "#models/media";
import Product from "#models/product";

export default class ProductDownload extends ProductDownloadSchema {
    static table = "product_downloads";

    @belongsTo(() => Product, { foreignKey: "productId" })
    declare product: BelongsTo<typeof Product>;

    @belongsTo(() => Media, { foreignKey: "mediaId" })
    declare media: BelongsTo<typeof Media>;
}
