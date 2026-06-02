import { Exception } from "@adonisjs/core/exceptions";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";

import type { DiscounterCouponContext, DiscounterCustomerContext } from "#contracts/discounter";
import { OrderStatus } from "#enums/order_status";
import type Cart from "#models/cart";
import Customer from "#models/customer";
import Order from "#models/order";
import OrderCouponLine from "#models/order_coupon_line";
import OrderLineItem from "#models/order_line_item";
import OrderShippingLine from "#models/order_shipping_line";
import Product from "#models/product";
import ProductVariation from "#models/product_variation";
import { type CartTotalsItem, computeCartTotals } from "#services/cart_totals_service";
import { getDiscounter } from "#services/discounter";
import { orderNumberService } from "#services/order_number_service";
import { resolvePrice } from "#services/price_resolver";
import SettingsService from "#services/settings_service";
import { enumerateShippingRates } from "#services/shipping_rate_service";
import { withTenantTransaction } from "#services/tenant_context";

const settings = new SettingsService();

/**
 * Snapshot of a product/variation pair at draft-creation time. The factory queries the cart's
 * items once, materializes the snapshot, and writes one `order_line_items` row per cart line plus
 * the running totals on the order.
 */
interface LineSnapshot {
    productId: number;
    variationId: number | null;
    name: string;
    sku: string | null;
    priceSnapshot: number;
    quantity: number;
    taxClassId: number | null;
    attributesSnapshot: Record<string, unknown>;
}

/**
 * `OrderFactory` converts a cart into a `draft` order — no stock reservation, no number
 * allocation. The output is a row the customer can keep editing through `PUT /checkout` until they
 * call `POST /checkout/submit`.
 */
export class OrderFactory {
    async fromCart(cart: Cart, opts: { trx?: TransactionClientContract; locale?: string } = {}): Promise<Order> {
        const run = async (trx: TransactionClientContract): Promise<Order> => {
            await cart.useTransaction(trx).load("items");
            if (cart.items.length === 0) {
                throw new Exception("Cannot create a draft order from an empty cart", {
                    status: 422,
                    code: "E_CART_EMPTY",
                });
            }

            const snapshots = await this.snapshotLines(cart, opts.locale ?? "fa", trx);
            const totals = await this.computeTotals(cart, snapshots, trx);

            const order = new Order();
            order.useTransaction(trx);
            order.orderNumber = await this.placeholderOrderNumber(trx);
            order.status = OrderStatus.Draft;
            order.customerId = cart.customerId === null ? null : Number(cart.customerId);
            order.currency = cart.currency;
            order.currencyDisplay = await settings.get<string>("general", "currency_display", "IRT");
            order.pricesIncludeTax = await settings.get<boolean>("tax", "prices_include_tax", true);
            order.createdVia = "checkout";
            order.cartHash = String(cart.id);
            order.itemsTotal = totals.itemsTotal;
            order.itemsTaxTotal = totals.itemsTaxTotal;
            order.shippingTotal = totals.shippingTotal;
            order.shippingTaxTotal = totals.shippingTaxTotal;
            order.feesTotal = 0;
            order.feesTaxTotal = 0;
            order.discountTotal = totals.discountTotal;
            order.discountTaxTotal = totals.discountTaxTotal;
            order.taxTotal = totals.taxTotal;
            order.grandTotal = totals.grandTotal;
            await order.save();

            for (const snap of snapshots) {
                const line = new OrderLineItem();
                line.useTransaction(trx);
                line.orderId = order.id;
                line.productId = snap.productId;
                line.variationId = snap.variationId;
                line.nameSnapshot = snap.name;
                line.skuSnapshot = snap.sku;
                line.quantity = snap.quantity;
                line.priceSnapshot = snap.priceSnapshot;
                const lineGross = snap.priceSnapshot * snap.quantity;
                line.subtotal = lineGross;
                line.subtotalTax = 0;
                line.total = lineGross;
                line.totalTax = 0;
                line.taxClassIdSnapshot = snap.taxClassId;
                line.attributesSnapshot = snap.attributesSnapshot;
                await line.save();
            }

            await this.writeShippingLine(order, cart, totals.shippingTotal, totals.shippingTaxTotal, trx);
            await this.writeCouponLines(order, cart, totals, trx);

            return order;
        };

        if (opts.trx) {
            return run(opts.trx);
        }
        return withTenantTransaction(run);
    }

    /**
     * Re-snapshot prices + lines from the latest catalog data. Returns the previous snapshot list
     * alongside the new one so the finalizer can compare for drift and surface a 409 to the
     * customer if anything moved.
     */
    async snapshotForFinalize(
        order: Order,
        trx: TransactionClientContract,
        locale = "fa",
    ): Promise<{ previous: LineSnapshot[]; current: LineSnapshot[] }> {
        const lines = await OrderLineItem.query({ client: trx }).where("order_id", Number(order.id));
        const previous: LineSnapshot[] = lines.map((line) => ({
            productId: Number(line.productId),
            variationId: line.variationId === null ? null : Number(line.variationId),
            name: line.nameSnapshot,
            sku: line.skuSnapshot,
            priceSnapshot: Number(line.priceSnapshot),
            quantity: line.quantity,
            taxClassId: line.taxClassIdSnapshot === null ? null : Number(line.taxClassIdSnapshot),
            attributesSnapshot: (line.attributesSnapshot as Record<string, unknown>) ?? {},
        }));

        const current: LineSnapshot[] = [];
        for (const line of lines) {
            const productId = Number(line.productId);
            if (!productId) continue;
            const product = await Product.find(productId, { client: trx });
            if (!product) {
                throw new Exception("A product on this order is no longer available", {
                    status: 422,
                    code: "E_PRODUCT_UNAVAILABLE",
                });
            }
            const variation =
                line.variationId === null ? null : await ProductVariation.find(Number(line.variationId), { client: trx });

            const translation = await product.related("translations").query().where("locale", locale).first();
            const fallback = await product.related("translations").query().first();
            const name = translation?.name ?? fallback?.name ?? `#${productId}`;
            const sku = variation?.sku ?? product.sku ?? null;
            const priceSnapshot = this.resolveLivePrice(product, variation);

            current.push({
                productId,
                variationId: line.variationId === null ? null : Number(line.variationId),
                name,
                sku,
                priceSnapshot,
                quantity: line.quantity,
                taxClassId: this.resolveTaxClassId(product, variation),
                attributesSnapshot: (line.attributesSnapshot as Record<string, unknown>) ?? {},
            });
        }
        return { previous, current };
    }

    private async snapshotLines(cart: Cart, locale: string, _trx: TransactionClientContract): Promise<LineSnapshot[]> {
        await cart.load("items", (q) =>
            q.preload("product", (productQuery) => productQuery.preload("translations")).preload("variation"),
        );

        const snapshots: LineSnapshot[] = [];
        for (const item of cart.items) {
            const product = item.product as Product | undefined;
            if (!product) {
                throw new Exception(`Cart line ${item.id} references a missing product`, {
                    status: 422,
                    code: "E_PRODUCT_MISSING",
                });
            }
            const variation =
                // biome-ignore lint/suspicious/noExplicitAny: `variation` is conditionally preloaded by the caller; not part of the cart-item static shape.
                item.variationId === null ? null : (((item as any).variation as ProductVariation | undefined) ?? null);

            const translations = product.translations ?? [];
            const match = translations.find((row) => row.locale === locale) ?? translations[0] ?? null;
            const name = match?.name ?? `#${product.id}`;
            const sku = variation?.sku ?? product.sku ?? null;

            snapshots.push({
                productId: Number(product.id),
                variationId: variation === null ? null : Number(variation.id),
                name,
                sku,
                priceSnapshot: Number(item.priceSnapshot),
                quantity: item.quantity,
                taxClassId: this.resolveTaxClassId(product, variation ?? null),
                attributesSnapshot: (item.attributesSnapshot as Record<string, unknown>) ?? {},
            });
        }
        return snapshots;
    }

    private async computeTotals(cart: Cart, snapshots: LineSnapshot[], trx: TransactionClientContract) {
        const pricesIncludeTax = await settings.get<boolean>("tax", "prices_include_tax", true);
        const itemsTotalGross = snapshots.reduce((sum, snap) => sum + snap.priceSnapshot * snap.quantity, 0);
        const shippingOptions = cart.country
            ? await enumerateShippingRates(
                  {
                      country: cart.country,
                      regionId: cart.regionId === null ? null : Number(cart.regionId),
                      postcode: cart.postcode,
                  },
                  itemsTotalGross,
              )
            : [];

        /**
         * Enrich snapshots with the discounter-only fields (categoryIds, tagIds, onSale). Preload
         * the products + relations once so the discount math sees the same data the cart-apply
         * eligibility check used.
         */
        const productIds = [...new Set(snapshots.map((s) => s.productId))];
        const products =
            productIds.length === 0
                ? ([] as Product[])
                : await Product.query({ client: trx }).whereIn("id", productIds).preload("categories").preload("tags");
        const productMap = new Map(products.map((p) => [Number(p.id), p]));
        const variationIds = snapshots.map((s) => s.variationId).filter((v): v is number => v !== null);
        const variations =
            variationIds.length === 0
                ? ([] as ProductVariation[])
                : await ProductVariation.query({ client: trx }).whereIn("id", variationIds);
        const variationMap = new Map(variations.map((v) => [Number(v.id), v]));

        const items: CartTotalsItem[] = snapshots.map((snap, index) => {
            const product = productMap.get(snap.productId);
            const variation = snap.variationId === null ? null : (variationMap.get(snap.variationId) ?? null);
            const onSale = product ? resolvePrice(product, variation).onSale : false;
            return {
                lineKey: String(index),
                id: index,
                productId: snap.productId,
                variationId: snap.variationId,
                quantity: snap.quantity,
                priceSnapshot: snap.priceSnapshot,
                taxClassId: snap.taxClassId,
                taxStatus: "taxable",
                requiresShipping: true,
                categoryIds: ((product?.categories ?? []) as Array<{ id: bigint | number }>).map((c) => Number(c.id)),
                tagIds: ((product?.tags ?? []) as Array<{ id: bigint | number }>).map((t) => Number(t.id)),
                onSale,
            };
        });

        await cart.useTransaction(trx).load("appliedCoupons");
        const appliedCoupons: DiscounterCouponContext[] = cart.appliedCoupons.map((row) => ({
            id: Number(row.couponId),
            code: row.codeSnapshot,
        }));
        const customer = await resolveCustomerContextFromCart(cart, trx);

        return computeCartTotals({
            items,
            address: cart.country
                ? { country: cart.country, regionId: cart.regionId === null ? null : Number(cart.regionId) }
                : null,
            selectedRateId: cart.shippingZoneMethodId == null ? null : Number(cart.shippingZoneMethodId),
            discounter: getDiscounter(),
            pricesIncludeTax,
            shippingOptions,
            appliedCoupons,
            customer,
        });
    }

    private async writeShippingLine(
        order: Order,
        cart: Cart,
        shippingTotal: number,
        shippingTax: number,
        trx: TransactionClientContract,
    ): Promise<void> {
        if (cart.shippingZoneMethodId == null) return;
        const row = await trx
            .from("shipping_zone_methods as szm")
            .innerJoin("shipping_methods as sm", "sm.id", "szm.method_id")
            .where("szm.id", Number(cart.shippingZoneMethodId))
            .select(
                "szm.id as instance_id",
                "sm.id as method_id",
                "sm.code as code",
                "sm.title_default as title_default",
                "szm.title_override as title_override",
            )
            .first();
        if (!row) return;
        const shippingLine = new OrderShippingLine();
        shippingLine.useTransaction(trx);
        shippingLine.orderId = order.id;
        shippingLine.methodIdSnapshot = row.method_id;
        shippingLine.instanceIdSnapshot = row.instance_id;
        shippingLine.methodCodeSnapshot = row.code;
        shippingLine.titleSnapshot = row.title_override ?? row.title_default;
        shippingLine.total = shippingTotal;
        shippingLine.totalTax = shippingTax;
        shippingLine.attributes = {};
        await shippingLine.save();
    }

    /**
     * Every order — draft or otherwise — gets its number from `order_number_seq`. The sequence is
     * gap-free at the engine level, so concurrent allocations cannot collide. Abandoned drafts
     * burn a sequence value; that's a deliberate tradeoff for "the number is stable from the
     * moment the customer first sees it on the draft."
     */
    private async placeholderOrderNumber(trx: TransactionClientContract): Promise<number> {
        return orderNumberService.allocate(trx);
    }

    private resolveLivePrice(product: Product, variation: ProductVariation | null): number {
        const now = Date.now();
        const inWindow = (start: unknown, end: unknown): boolean => {
            const startMs = start instanceof Date ? start.getTime() : start ? Number(start) : null;
            const endMs = end instanceof Date ? end.getTime() : end ? Number(end) : null;
            if (startMs && startMs > now) return false;
            if (endMs && endMs < now) return false;
            return true;
        };

        if (variation) {
            const salePrice = variation.salePrice === null ? null : Number(variation.salePrice);
            // biome-ignore lint/suspicious/noExplicitAny: variation sale-window columns populated by catalog-writer but not in the static schema yet.
            if (salePrice !== null && inWindow((variation as any).saleStartsAt, (variation as any).saleEndsAt)) {
                return salePrice;
            }
            return Number(variation.regularPrice);
        }

        const salePrice = product.salePrice === null ? null : Number(product.salePrice);
        // biome-ignore lint/suspicious/noExplicitAny: product sale-window columns populated by catalog-writer but not in the static schema yet.
        if (salePrice !== null && inWindow((product as any).saleStartsAt, (product as any).saleEndsAt)) {
            return salePrice;
        }
        return product.regularPrice === null ? 0 : Number(product.regularPrice);
    }

    private resolveTaxClassId(product: Product, variation: ProductVariation | null): number | null {
        const variationClass = variation?.taxClassId;
        if (variationClass !== undefined && variationClass !== null) return Number(variationClass);
        const productClass = product.taxClassId;
        if (productClass !== undefined && productClass !== null) return Number(productClass);
        return null;
    }

    /**
     * Snapshot one `order_coupon_lines` row per applied coupon, distributing the discounter's
     * total across the codes. Allocation is simple: the cart's `discountTotal` goes to the single
     * applied coupon, or splits evenly when several stack, with the rounding residual landing on
     * the first row. `discount_tax` is always 0 — line tax already gets recomputed on the
     * post-discount base in the totals service, so this column is reserved for future
     * tax-inclusive carts that need a separate audit field.
     */
    private async writeCouponLines(
        order: Order,
        cart: Cart,
        totals: { discountTotal: number; discountTaxTotal: number },
        trx: TransactionClientContract,
    ): Promise<void> {
        await cart.useTransaction(trx).load("appliedCoupons");
        if (cart.appliedCoupons.length === 0) return;

        const codes = cart.appliedCoupons.map((row) => ({
            couponId: Number(row.couponId),
            code: row.codeSnapshot,
        }));
        /** Equal split when multiple coupons stack; residual goes to the first row. */
        const share = Math.floor(totals.discountTotal / codes.length);
        let residual = totals.discountTotal - share * codes.length;

        for (const entry of codes) {
            const line = new OrderCouponLine();
            line.useTransaction(trx);
            line.orderId = order.id;
            line.couponId = entry.couponId;
            line.codeSnapshot = entry.code;
            line.discount = share + residual;
            line.discountTax = 0;
            residual = 0;
            await line.save();
        }
    }
}

export const orderFactory = new OrderFactory();

/**
 * Pull the customer/email pair off the cart inside the factory's transaction. Used as the
 * discounter's per-user context — guests get `customerId=null` and an email pulled from the cart
 * once the storefront has set one (defaults to `null` if absent).
 */
async function resolveCustomerContextFromCart(cart: Cart, trx: TransactionClientContract): Promise<DiscounterCustomerContext> {
    const customerId = cart.customerId === null || cart.customerId === undefined ? null : Number(cart.customerId);
    let email: string | null = null;
    if (customerId !== null) {
        const customer = await Customer.query({ client: trx }).where("id", customerId).preload("user").first();
        email = customer?.user?.email ?? null;
    }
    return { customerId, email };
}
