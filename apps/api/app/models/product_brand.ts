import { belongsTo, hasMany, manyToMany } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany, ManyToMany } from "@adonisjs/lucid/types/relations";

import { ProductBrandSchema } from "#database/schema";
import Media from "#models/media";
import Product from "#models/product";
import ProductBrandTranslation from "#models/product_brand_translation";

export default class ProductBrand extends ProductBrandSchema {
    static table = "product_brands";

    @hasMany(() => ProductBrandTranslation, { foreignKey: "brandId" })
    declare translations: HasMany<typeof ProductBrandTranslation>;

    @belongsTo(() => Media, { foreignKey: "imageMediaId" })
    declare image: BelongsTo<typeof Media>;

    @manyToMany(() => Product, {
        pivotTable: "product_brand_links",
        localKey: "id",
        pivotForeignKey: "brand_id",
        relatedKey: "id",
        pivotRelatedForeignKey: "product_id",
    })
    declare products: ManyToMany<typeof Product>;
}
