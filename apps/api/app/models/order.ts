import { belongsTo, column, hasMany, hasOne } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany, HasOne } from "@adonisjs/lucid/types/relations";

import { OrderSchema } from "#database/schema";
import type { OrderStatus } from "#enums/order_status";
import Customer from "#models/customer";
import OrderAddress from "#models/order_address";
import OrderCouponLine from "#models/order_coupon_line";
import OrderFeeLine from "#models/order_fee_line";
import OrderLineItem from "#models/order_line_item";
import OrderMeta from "#models/order_meta";
import OrderShippingLine from "#models/order_shipping_line";
import OrderStatusHistory from "#models/order_status_history";
import OrderTaxLine from "#models/order_tax_line";
import PaymentAttempt from "#models/payment_attempt";
import PaymentGateway from "#models/payment_gateway";

/**
 * Order aggregate root. The `status` column is governed by `OrderStateMachine` — controllers
 * NEVER mutate `status` directly. The two `*_snapshot` columns + `serializeAs: null` on the
 * idempotency key keep sensitive bookkeeping out of API responses.
 */
export default class Order extends OrderSchema {
    static table = "orders";

    /** Re-declare with the strict {@link OrderStatus} string-union for type-safe comparisons. */
    @column()
    declare status: OrderStatus;

    /**
     * The `Idempotency-Key` value the submitter sent. Never echoed in responses — leaking it would
     * let an attacker replay another customer's submit and observe their order state.
     */
    @column({ serializeAs: null })
    declare idempotencyKey: string | null;

    /** Snapshot of the source cart id. Internal forensics only, never serialized. */
    @column({ serializeAs: null })
    declare cartHash: string | null;

    @belongsTo(() => Customer, { foreignKey: "customerId" })
    declare customer: BelongsTo<typeof Customer>;

    @belongsTo(() => PaymentGateway, { foreignKey: "paymentGatewayIdSnapshot" })
    declare paymentGateway: BelongsTo<typeof PaymentGateway>;

    @hasMany(() => OrderLineItem, { foreignKey: "orderId" })
    declare lineItems: HasMany<typeof OrderLineItem>;

    @hasMany(() => OrderAddress, { foreignKey: "orderId" })
    declare addresses: HasMany<typeof OrderAddress>;

    @hasMany(() => OrderShippingLine, { foreignKey: "orderId" })
    declare shippingLines: HasMany<typeof OrderShippingLine>;

    @hasMany(() => OrderFeeLine, { foreignKey: "orderId" })
    declare feeLines: HasMany<typeof OrderFeeLine>;

    @hasMany(() => OrderCouponLine, { foreignKey: "orderId" })
    declare couponLines: HasMany<typeof OrderCouponLine>;

    @hasMany(() => OrderTaxLine, { foreignKey: "orderId" })
    declare taxLines: HasMany<typeof OrderTaxLine>;

    @hasMany(() => OrderStatusHistory, { foreignKey: "orderId" })
    declare statusHistory: HasMany<typeof OrderStatusHistory>;

    @hasMany(() => OrderMeta, { foreignKey: "orderId" })
    declare meta: HasMany<typeof OrderMeta>;

    @hasOne(() => OrderAddress, {
        foreignKey: "orderId",
        onQuery: (q) => q.where("kind", "billing"),
    })
    declare billingAddress: HasOne<typeof OrderAddress>;

    @hasOne(() => OrderAddress, {
        foreignKey: "orderId",
        onQuery: (q) => q.where("kind", "shipping"),
    })
    declare shippingAddress: HasOne<typeof OrderAddress>;

    @hasMany(() => PaymentAttempt, { foreignKey: "orderId" })
    declare paymentAttempts: HasMany<typeof PaymentAttempt>;

    @belongsTo(() => PaymentAttempt, { foreignKey: "lastPaymentAttemptId" })
    declare lastPaymentAttempt: BelongsTo<typeof PaymentAttempt>;
}
