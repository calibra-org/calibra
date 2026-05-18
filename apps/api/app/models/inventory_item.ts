import { belongsTo, hasMany } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";

import { InventoryItemSchema } from "#database/schema";
import InventoryMovement from "#models/inventory_movement";
import Product from "#models/product";
import ProductVariation from "#models/product_variation";

export default class InventoryItem extends InventoryItemSchema {
    static table = "inventory_items";

    @belongsTo(() => Product, { foreignKey: "productId" })
    declare product: BelongsTo<typeof Product>;

    @belongsTo(() => ProductVariation, { foreignKey: "variationId" })
    declare variation: BelongsTo<typeof ProductVariation>;

    @hasMany(() => InventoryMovement, { foreignKey: "inventoryItemId" })
    declare movements: HasMany<typeof InventoryMovement>;
}
