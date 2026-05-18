import { belongsTo, manyToMany } from "@adonisjs/lucid/orm";
import type { BelongsTo, ManyToMany } from "@adonisjs/lucid/types/relations";

import { ProductAttributeLinkSchema } from "#database/schema";
import Product from "#models/product";
import ProductAttribute from "#models/product_attribute";
import ProductAttributeTerm from "#models/product_attribute_term";

export default class ProductAttributeLink extends ProductAttributeLinkSchema {
    static table = "product_attribute_links";

    @belongsTo(() => Product, { foreignKey: "productId" })
    declare product: BelongsTo<typeof Product>;

    @belongsTo(() => ProductAttribute, { foreignKey: "attributeId" })
    declare attribute: BelongsTo<typeof ProductAttribute>;

    @manyToMany(() => ProductAttributeTerm, {
        pivotTable: "product_attribute_link_terms",
        localKey: "id",
        pivotForeignKey: "link_id",
        relatedKey: "id",
        pivotRelatedForeignKey: "term_id",
    })
    declare terms: ManyToMany<typeof ProductAttributeTerm>;
}
