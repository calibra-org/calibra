import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductTagTranslationSchema } from "#database/schema";
import ProductTag from "#models/product_tag";

export default class ProductTagTranslation extends ProductTagTranslationSchema {
    static table = "product_tag_translations";

    @belongsTo(() => ProductTag, { foreignKey: "tagId" })
    declare tag: BelongsTo<typeof ProductTag>;
}
