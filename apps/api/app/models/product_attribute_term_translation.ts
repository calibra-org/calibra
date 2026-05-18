import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { ProductAttributeTermTranslationSchema } from "#database/schema";
import ProductAttributeTerm from "#models/product_attribute_term";

export default class ProductAttributeTermTranslation extends ProductAttributeTermTranslationSchema {
    static table = "product_attribute_term_translations";

    @belongsTo(() => ProductAttributeTerm, { foreignKey: "termId" })
    declare term: BelongsTo<typeof ProductAttributeTerm>;
}
