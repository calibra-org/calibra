import { belongsTo, hasMany } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";

import { ProductVariationSchema } from "#database/schema";
import InventoryItem from "#models/inventory_item";
import Media from "#models/media";
import Product from "#models/product";
import ProductVariationAttribute from "#models/product_variation_attribute";
import ProductVariationTranslation from "#models/product_variation_translation";
import TaxClass from "#models/tax_class";

export default class ProductVariation extends ProductVariationSchema {
    static table = "product_variations";

    @belongsTo(() => Product, { foreignKey: "productId" })
    declare product: BelongsTo<typeof Product>;

    @hasMany(() => ProductVariationTranslation, { foreignKey: "variationId" })
    declare translations: HasMany<typeof ProductVariationTranslation>;

    @hasMany(() => ProductVariationAttribute, { foreignKey: "variationId" })
    declare attributePins: HasMany<typeof ProductVariationAttribute>;

    @hasMany(() => InventoryItem, { foreignKey: "variationId" })
    declare inventoryItems: HasMany<typeof InventoryItem>;

    @belongsTo(() => Media, { foreignKey: "imageMediaId" })
    declare image: BelongsTo<typeof Media>;

    @belongsTo(() => TaxClass, { foreignKey: "taxClassId" })
    declare taxClass: BelongsTo<typeof TaxClass>;
}
