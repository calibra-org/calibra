import { belongsTo, column } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { PaymentAttemptSchema } from "#database/schema";
import type { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import Order from "#models/order";
import PaymentGateway from "#models/payment_gateway";

/**
 * Polymorphic ledger of every payment attempt against an order — one row per init/verify cycle.
 * UNIQUE `(gateway_id, gateway_transaction_id)` is the anti-double-credit guarantee enforced at the
 * database layer; controllers never have to reason about PSP retries. `idempotencyKey` is never
 * echoed to clients.
 */
export default class PaymentAttempt extends PaymentAttemptSchema {
    static table = "payment_attempts";

    /** Re-declare with the strict {@link PaymentAttemptStatus} union for type-safe comparisons. */
    @column()
    declare status: PaymentAttemptStatus;

    /** Internal-only — leaking would let a replay attack hijack the row. */
    @column({ serializeAs: null })
    declare idempotencyKey: string | null;

    @belongsTo(() => Order, { foreignKey: "orderId" })
    declare order: BelongsTo<typeof Order>;

    @belongsTo(() => PaymentGateway, { foreignKey: "gatewayId" })
    declare gateway: BelongsTo<typeof PaymentGateway>;
}
