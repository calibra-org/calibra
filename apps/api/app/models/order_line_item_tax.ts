import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { OrderLineItemTaxSchema } from "#database/schema";
import OrderLineItem from "#models/order_line_item";
import TaxRate from "#models/tax_rate";

export default class OrderLineItemTax extends OrderLineItemTaxSchema {
    static table = "order_line_item_taxes";

    @belongsTo(() => OrderLineItem, { foreignKey: "lineItemId" })
    declare lineItem: BelongsTo<typeof OrderLineItem>;

    @belongsTo(() => TaxRate, { foreignKey: "taxRateId" })
    declare taxRate: BelongsTo<typeof TaxRate>;
}
