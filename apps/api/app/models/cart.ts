import { randomBytes } from "node:crypto";
import { beforeCreate, belongsTo, hasMany } from "@adonisjs/lucid/orm";
import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";
import { DateTime } from "luxon";

import { CartSchema } from "#database/schema";
import CartAppliedCoupon from "#models/cart_applied_coupon";
import CartItem from "#models/cart_item";
import Customer from "#models/customer";
import Region from "#models/region";
import ShippingZoneMethod from "#models/shipping_zone_method";

/**
 * Length of the random opaque cart token (hex chars). 40 hex chars = 160 bits of entropy, set as
 * the `cart_token` cookie value and stored CHAR(40) on disk.
 */
const CART_TOKEN_HEX_LENGTH = 40;

export default class Cart extends CartSchema {
    static table = "carts";

    @hasMany(() => CartItem, { foreignKey: "cartId" })
    declare items: HasMany<typeof CartItem>;

    @hasMany(() => CartAppliedCoupon, { foreignKey: "cartId" })
    declare appliedCoupons: HasMany<typeof CartAppliedCoupon>;

    @belongsTo(() => Customer, { foreignKey: "customerId" })
    declare customer: BelongsTo<typeof Customer>;

    @belongsTo(() => Region, { foreignKey: "regionId" })
    declare region: BelongsTo<typeof Region>;

    @belongsTo(() => ShippingZoneMethod, { foreignKey: "shippingZoneMethodId" })
    declare shippingZoneMethod: BelongsTo<typeof ShippingZoneMethod>;

    /**
     * Set the opaque token on insert if the caller didn't pre-assign one. Hex over base32 keeps the
     * column simple to grep / reproduce in psql while staying URL-safe in the cookie.
     */
    @beforeCreate()
    static assignToken(cart: Cart): void {
        if (!cart.token) {
            cart.token = randomBytes(CART_TOKEN_HEX_LENGTH / 2).toString("hex");
        }
    }

    /**
     * Reassign this anonymous cart to `customerId`, merging into the customer's existing cart when
     * one exists. Merge semantics: quantities are summed by `(product_id, variation_id)`. The
     * losing cart is deleted. The whole sequence runs in a single transaction so concurrent logins
     * cannot leave a dangling row.
     *
     * Returns the cart that survived (`this` if no existing customer cart, the customer's cart
     * otherwise) so callers can re-bind the request to the survivor without an extra query.
     */
    async assignCustomer(customerId: bigint | number): Promise<Cart> {
        const numericCustomerId = Number(customerId);

        return db.transaction(async (trx) => {
            this.useTransaction(trx);
            const existing = await Cart.query({ client: trx })
                .where("customer_id", numericCustomerId)
                .whereNot("id", Number(this.id))
                .forUpdate()
                .first();

            if (!existing) {
                this.customerId = numericCustomerId;
                await this.save();
                return this;
            }

            existing.useTransaction(trx);
            await Cart.mergeItemsInto(trx, existing, this);
            await this.delete();
            existing.lastActivityAt = DateTime.utc();
            await existing.save();
            return existing;
        });
    }

    /**
     * Helper that folds every item of `source` into `destination`, summing quantities on the
     * `(product_id, variation_id)` key. The destination cart's `price_snapshot` wins — the source's
     * snapshot is discarded, which matches the "cart re-pricing happens at add-time" rule:
     * yesterday's price on yesterday's cart shouldn't outvote today's price on today's cart.
     */
    private static async mergeItemsInto(trx: TransactionClientContract, destination: Cart, source: Cart): Promise<void> {
        await source.load("items");
        for (const sourceItem of source.items) {
            const variationKey = sourceItem.variationId === null ? null : Number(sourceItem.variationId);
            const existing = await CartItem.query({ client: trx })
                .where("cart_id", Number(destination.id))
                .where("product_id", Number(sourceItem.productId))
                .where((q) => {
                    if (variationKey === null) {
                        q.whereNull("variation_id");
                    } else {
                        q.where("variation_id", variationKey);
                    }
                })
                .forUpdate()
                .first();

            if (existing) {
                existing.quantity = existing.quantity + sourceItem.quantity;
                existing.useTransaction(trx);
                await existing.save();
            } else {
                await CartItem.create(
                    {
                        cartId: destination.id,
                        productId: sourceItem.productId,
                        variationId: sourceItem.variationId,
                        quantity: sourceItem.quantity,
                        priceSnapshot: sourceItem.priceSnapshot,
                        attributesSnapshot: sourceItem.attributesSnapshot,
                    },
                    { client: trx },
                );
            }
        }
    }
}
