import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { InventoryMovementSchema } from "#database/schema";
import InventoryItem from "#models/inventory_item";

export default class InventoryMovement extends InventoryMovementSchema {
    static table = "inventory_movements";

    @belongsTo(() => InventoryItem, { foreignKey: "inventoryItemId" })
    declare inventoryItem: BelongsTo<typeof InventoryItem>;
}
