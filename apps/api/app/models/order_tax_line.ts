import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { OrderTaxLineSchema } from "#database/schema";
import Order from "#models/order";
import TaxRate from "#models/tax_rate";

export default class OrderTaxLine extends OrderTaxLineSchema {
    static table = "order_tax_lines";

    @belongsTo(() => Order, { foreignKey: "orderId" })
    declare order: BelongsTo<typeof Order>;

    @belongsTo(() => TaxRate, { foreignKey: "taxRateIdSnapshot" })
    declare taxRate: BelongsTo<typeof TaxRate>;
}
