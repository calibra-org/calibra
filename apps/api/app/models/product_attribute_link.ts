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

    /**
     * Carries the operator's chosen ordering of values via the pivot's `position` column.
     * Without `pivotColumns + orderBy`, the storefront and admin both render terms in
     * implementation-defined PostgreSQL row order, so drag-reorders silently revert on reload.
     */
    @manyToMany(() => ProductAttributeTerm, {
        pivotTable: "product_attribute_link_terms",
        localKey: "id",
        pivotForeignKey: "link_id",
        relatedKey: "id",
        pivotRelatedForeignKey: "term_id",
        pivotColumns: ["position"],
        onQuery: (query) => {
            query.orderBy("product_attribute_link_terms.position", "asc");
        },
    })
    declare terms: ManyToMany<typeof ProductAttributeTerm>;
}
