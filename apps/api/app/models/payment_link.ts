import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { PaymentLinkSchema } from "#database/schema";
import Order from "#models/order";
import PaymentGateway from "#models/payment_gateway";

/**
 * Pattern 6 (extensibility) — placeholder for the future "send a payment link to a customer over
 * WhatsApp" feature. No controllers/endpoints in MVP; the model exists so the schema is queryable
 * once the feature ships.
 */
export default class PaymentLink extends PaymentLinkSchema {
    static table = "payment_links";

    @belongsTo(() => Order, { foreignKey: "orderId" })
    declare order: BelongsTo<typeof Order>;

    @belongsTo(() => PaymentGateway, { foreignKey: "gatewayId" })
    declare gateway: BelongsTo<typeof PaymentGateway>;
}
