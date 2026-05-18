import { belongsTo, hasMany, manyToMany } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany, ManyToMany } from "@adonisjs/lucid/types/relations";

import { ProductCategorySchema } from "#database/schema";
import Media from "#models/media";
import Product from "#models/product";
import ProductCategoryTranslation from "#models/product_category_translation";

export default class ProductCategory extends ProductCategorySchema {
    static table = "product_categories";

    @hasMany(() => ProductCategoryTranslation, { foreignKey: "categoryId" })
    declare translations: HasMany<typeof ProductCategoryTranslation>;

    @belongsTo(() => ProductCategory, { foreignKey: "parentId" })
    declare parent: BelongsTo<typeof ProductCategory>;

    @hasMany(() => ProductCategory, { foreignKey: "parentId" })
    declare children: HasMany<typeof ProductCategory>;

    @belongsTo(() => Media, { foreignKey: "imageMediaId" })
    declare image: BelongsTo<typeof Media>;

    @manyToMany(() => Product, {
        pivotTable: "product_category_links",
        localKey: "id",
        pivotForeignKey: "category_id",
        relatedKey: "id",
        pivotRelatedForeignKey: "product_id",
    })
    declare products: ManyToMany<typeof Product>;
}
