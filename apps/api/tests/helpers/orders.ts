import db from "@adonisjs/lucid/services/db";

import { OrderStatus } from "#enums/order_status";
import Cart from "#models/cart";
import CartItem from "#models/cart_item";
import type Customer from "#models/customer";
import Order from "#models/order";
import OrderLineItem from "#models/order_line_item";
import PaymentGateway from "#models/payment_gateway";
import type Product from "#models/product";
import Region from "#models/region";
import { resetWithFoundation } from "#tests/helpers/cart";
import { TEST_TENANT_ID } from "#tests/helpers/tenant";

/**
 * Foundation seeder upserts by `(country_code, code)` so the surrogate `regions.id` values shift
 * between test runs that interleave `testUtils.db().truncate()` with `resetWithFoundation()`.
 * Tests that need a stable Iran region lookup go through this helper rather than hard-coding `1`.
 */
export async function iranRegionId(): Promise<number> {
    const region = await Region.findByOrFail("code", "IR-24");
    return Number(region.id);
}

/**
 * Truncate the order tables on top of the phase-04 reset. Use this for tests that need a clean
 * order space — `resetWithFoundation()` alone leaves order rows intact across tests.
 */
export async function truncatePhase05Tables(): Promise<void> {
    const tables = [
        "order_address_iran_extensions",
        "order_documents",
        "order_status_history",
        "order_tax_lines",
        "order_coupon_lines",
        "order_fee_lines",
        "order_shipping_lines",
        "order_line_item_taxes",
        "order_line_items",
        "order_addresses",
        "orders",
    ];
    await db.rawQuery(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
    await db.rawQuery("ALTER SEQUENCE order_number_seq RESTART WITH 1000");
}

export async function resetPhase05(): Promise<void> {
    await resetWithFoundation();
    await truncatePhase05Tables();
}

/**
 * Build a draft order directly (skipping the cart → factory path) so state-machine tests can
 * focus on the transition alone. Returns the persisted order with a single line item.
 */
export async function makeDraftOrder(args: {
    customerId?: number | null;
    productId: number;
    quantity: number;
    price: number;
    gatewayId?: number;
}): Promise<Order> {
    const order = await Order.create({
        /**
         * Stamp the tenant explicitly so the in-memory instance carries `tenantId` for downstream
         * event listeners (e.g. `order:*` cache invalidation reads `order.tenantId`). Created outside
         * a request context, the model's tenant-stamp hook is a no-op and only the DB column default
         * (the suite GUC) fills the row — which Lucid does not reflect back onto the instance.
         */
        tenantId: TEST_TENANT_ID,
        orderNumber: await nextOrderNumber(),
        status: OrderStatus.Draft,
        customerId: args.customerId ?? null,
        currency: "IRR",
        currencyDisplay: "IRT",
        pricesIncludeTax: true,
        createdVia: "checkout",
        paymentGatewayIdSnapshot: args.gatewayId ?? (await defaultGatewayId()),
        paymentMethodCodeSnapshot: "cod",
        paymentMethodTitleSnapshot: "cod",
        itemsTotal: args.price * args.quantity,
        grandTotal: args.price * args.quantity,
    });
    await OrderLineItem.create({
        orderId: order.id,
        productId: args.productId,
        variationId: null,
        nameSnapshot: "Test product",
        skuSnapshot: "SKU",
        quantity: args.quantity,
        priceSnapshot: args.price,
        subtotal: args.price * args.quantity,
        subtotalTax: 0,
        total: args.price * args.quantity,
        totalTax: 0,
        taxClassIdSnapshot: null,
        attributesSnapshot: {},
    });
    return order;
}

async function nextOrderNumber(): Promise<number> {
    const result = (await db.rawQuery("SELECT nextval('order_number_seq') as next")) as {
        rows?: Array<{ next: unknown }>;
    };
    return Number(result.rows?.[0]?.next ?? 0);
}

async function defaultGatewayId(): Promise<number> {
    const gateway = await PaymentGateway.findBy("code", "cod");
    if (!gateway) throw new Error("seed missing cod payment gateway");
    return Number(gateway.id);
}

/**
 * Seed a fully-prepared cart for a registered customer: one taxable product with stock, an Iran
 * address set, and a free_shipping rate selected (cost = 0 so no extra gateway integration needed).
 * Returns the cart + product so tests can assert on either.
 */
export async function seedCustomerCartReadyToCheckout(customer: Customer, product: Product, quantity = 1): Promise<Cart> {
    const regionId = await iranRegionId();
    const cart = await Cart.create({
        customerId: customer.id,
        currency: "IRR",
        country: "IR",
        regionId,
        postcode: "1234567890",
    });
    await CartItem.create({
        cartId: cart.id,
        productId: product.id,
        variationId: null,
        quantity,
        priceSnapshot: Number(product.regularPrice),
        attributesSnapshot: {},
    });
    /** free_shipping is method instance 4 (cost=0, min_amount=5,000,000 — picked manually in tests). */
    const szm = await db
        .from("shipping_zone_methods as szm")
        .innerJoin("shipping_methods as sm", "sm.id", "szm.method_id")
        .where("sm.code", "free_shipping")
        .select("szm.id")
        .first();
    if (szm) {
        cart.shippingZoneMethodId = Number(szm.id);
        await cart.save();
    }
    return cart;
}
