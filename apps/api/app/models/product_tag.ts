import { hasMany, manyToMany } from "@adonisjs/lucid/orm";
import type { HasMany, ManyToMany } from "@adonisjs/lucid/types/relations";

import { ProductTagSchema } from "#database/schema";
import Product from "#models/product";
import ProductTagTranslation from "#models/product_tag_translation";

export default class ProductTag extends ProductTagSchema {
    static table = "product_tags";

    @hasMany(() => ProductTagTranslation, { foreignKey: "tagId" })
    declare translations: HasMany<typeof ProductTagTranslation>;

    @manyToMany(() => Product, {
        pivotTable: "product_tag_links",
        localKey: "id",
        pivotForeignKey: "tag_id",
        relatedKey: "id",
        pivotRelatedForeignKey: "product_id",
    })
    declare products: ManyToMany<typeof Product>;
}
