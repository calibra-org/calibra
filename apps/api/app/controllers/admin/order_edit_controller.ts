import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import { DateTime } from "luxon";

import Coupon from "#models/coupon";
import Customer from "#models/customer";
import Order from "#models/order";
import OrderAddress from "#models/order_address";
import OrderCouponLine from "#models/order_coupon_line";
import OrderFeeLine from "#models/order_fee_line";
import OrderLineItem from "#models/order_line_item";
import OrderMeta from "#models/order_meta";
import OrderShippingLine from "#models/order_shipping_line";
import Product from "#models/product";
import ProductVariation from "#models/product_variation";
import { CacheInvalidation } from "#services/cache_invalidation";
import { currentTenantId, currentTrx, withTenantTransaction } from "#services/tenant_context";
import OrderTransformer from "#transformers/order_transformer";
import {
    adminOrderAddressUpdateValidator,
    adminOrderCouponApplyValidator,
    adminOrderFeeCreateValidator,
    adminOrderHeaderUpdateValidator,
    adminOrderLineItemCreateValidator,
    adminOrderLineItemUpdateValidator,
    adminOrderMetaUpsertValidator,
    adminOrderRecalculateValidator,
    adminOrderShippingLineCreateValidator,
    adminOrderShippingLineUpdateValidator,
} from "#validators/admin/order_validator";

/**
 * All admin-only mutations against an existing order — addresses, line items, fees, shipping
 * lines, coupons, header, recalculate-totals, and meta. Kept in its own controller so the
 * canonical `orders_controller.ts` stays focused on list/show/create/status. Every endpoint
 * loads the order through {@link findOrFail} (which excludes soft-deleted rows), runs the
 * mutation inside a transaction where multi-row updates are involved, and returns the freshly
 * loaded order via {@link respondWithOrder} so the client never sees a partial mutation.
 */
export default class AdminOrderEditController {
    async updateAddress(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const kind = ctx.params.kind === "shipping" ? "shipping" : "billing";
        const payload = await ctx.request.validateUsing(adminOrderAddressUpdateValidator);

        await withTenantTransaction(async (trx) => {
            const existing = await OrderAddress.query({ client: trx })
                .where("order_id", Number(order.id))
                .where("kind", kind)
                .first();
            const row = existing ?? new OrderAddress();
            row.useTransaction(trx);
            row.orderId = order.id;
            row.kind = kind;
            row.firstName = payload.first_name;
            row.lastName = payload.last_name;
            row.company = payload.company ?? null;
            row.addressLine1 = payload.address_line_1;
            row.addressLine2 = payload.address_line_2 ?? null;
            row.city = payload.city;
            row.regionId = payload.region_id ?? null;
            row.regionText = payload.region_text ?? null;
            row.postcode = payload.postcode ?? null;
            row.country = payload.country.toUpperCase();
            row.phone = payload.phone ?? null;
            row.email = kind === "billing" ? (payload.email ?? null) : null;
            row.attributes = {
                ...((row.attributes as Record<string, unknown>) ?? {}),
                national_id: payload.national_id ?? null,
                customer_note: kind === "shipping" ? (payload.customer_note ?? null) : undefined,
            };
            await row.save();

            if (kind === "billing" && payload.email) {
                order.useTransaction(trx);
                order.billingEmail = payload.email;
                await order.save();
            }
        });

        return this.respondWithOrder(order);
    }

    async createLineItem(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminOrderLineItemCreateValidator);

        await withTenantTransaction(async (trx) => {
            const product = await Product.find(payload.product_id, { client: trx });
            if (!product) {
                throw new Exception("Product not found", { status: 422, code: "E_PRODUCT_MISSING" });
            }
            const variation =
                payload.variation_id === undefined || payload.variation_id === null
                    ? null
                    : await ProductVariation.find(payload.variation_id, { client: trx });

            const translation = await product.related("translations").query().useTransaction(trx).first();
            const basePrice = Number(variation?.regularPrice ?? product.regularPrice ?? 0);
            const price = payload.price_override_minor ?? basePrice;
            const lineItem = new OrderLineItem();
            lineItem.useTransaction(trx);
            lineItem.orderId = order.id;
            lineItem.productId = product.id;
            lineItem.variationId = variation === null ? null : variation.id;
            lineItem.nameSnapshot = translation?.name ?? `#${product.id}`;
            lineItem.skuSnapshot = variation?.sku ?? product.sku ?? null;
            lineItem.quantity = payload.quantity;
            lineItem.priceSnapshot = price;
            const gross = price * payload.quantity;
            lineItem.subtotal = gross;
            lineItem.subtotalTax = 0;
            lineItem.total = gross;
            lineItem.totalTax = 0;
            lineItem.taxClassIdSnapshot = product.taxClassId ?? null;
            lineItem.attributesSnapshot = {};
            await lineItem.save();
        });

        await this.recomputeTotals(order);
        ctx.response.status(201);
        return this.respondWithOrder(order);
    }

    async updateLineItem(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const lineId = Number(ctx.params.lineId);
        if (!Number.isFinite(lineId)) {
            throw new Exception("Line not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const payload = await ctx.request.validateUsing(adminOrderLineItemUpdateValidator);

        const line = await OrderLineItem.query().where("order_id", Number(order.id)).where("id", lineId).first();
        if (!line) {
            throw new Exception("Line not found", { status: 404, code: "E_NOT_FOUND" });
        }
        if (payload.quantity !== undefined) line.quantity = payload.quantity;
        if (payload.price_override_minor !== undefined && payload.price_override_minor !== null) {
            line.priceSnapshot = payload.price_override_minor;
        }
        if (payload.name !== undefined) line.nameSnapshot = payload.name;
        const gross = Number(line.priceSnapshot) * line.quantity;
        line.subtotal = gross;
        line.total = gross;
        await line.save();

        await this.recomputeTotals(order);
        return this.respondWithOrder(order);
    }

    async deleteLineItem(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const lineId = Number(ctx.params.lineId);
        if (!Number.isFinite(lineId)) {
            throw new Exception("Line not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const refundCount = (await currentTrx()
            .from("order_refund_line_items")
            .where("order_line_item_id", lineId)
            .count("* as c")
            .first()) as { c: string | number } | undefined;
        if (Number(refundCount?.c ?? 0) > 0) {
            throw new Exception("Line item has refunds and cannot be removed", {
                status: 409,
                code: "E_LINE_ITEM_HAS_REFUND",
            });
        }
        const line = await OrderLineItem.query().where("order_id", Number(order.id)).where("id", lineId).first();
        if (!line) {
            throw new Exception("Line not found", { status: 404, code: "E_NOT_FOUND" });
        }
        await line.delete();
        await this.recomputeTotals(order);
        return this.respondWithOrder(order);
    }

    async createFee(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminOrderFeeCreateValidator);
        const fee = new OrderFeeLine();
        fee.orderId = order.id;
        fee.nameSnapshot = payload.title;
        fee.total = payload.amount_minor;
        fee.totalTax = 0;
        fee.taxable = payload.taxable ?? false;
        fee.taxClassIdSnapshot = payload.tax_class_id ?? null;
        await fee.save();
        await this.recomputeTotals(order);
        ctx.response.status(201);
        return this.respondWithOrder(order);
    }

    async deleteFee(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const feeId = Number(ctx.params.feeId);
        const fee = await OrderFeeLine.query().where("order_id", Number(order.id)).where("id", feeId).first();
        if (!fee) {
            throw new Exception("Fee not found", { status: 404, code: "E_NOT_FOUND" });
        }
        await fee.delete();
        await this.recomputeTotals(order);
        return this.respondWithOrder(order);
    }

    async createShippingLine(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminOrderShippingLineCreateValidator);
        const line = new OrderShippingLine();
        line.orderId = order.id;
        line.methodCodeSnapshot = payload.method_code;
        line.titleSnapshot = payload.title;
        line.total = payload.total_minor;
        line.totalTax = 0;
        line.attributes = {};
        await line.save();
        await this.recomputeTotals(order);
        ctx.response.status(201);
        return this.respondWithOrder(order);
    }

    async updateShippingLine(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const lineId = Number(ctx.params.lineId);
        const payload = await ctx.request.validateUsing(adminOrderShippingLineUpdateValidator);
        const line = await OrderShippingLine.query().where("order_id", Number(order.id)).where("id", lineId).first();
        if (!line) {
            throw new Exception("Shipping line not found", { status: 404, code: "E_NOT_FOUND" });
        }
        if (payload.method_code !== undefined) line.methodCodeSnapshot = payload.method_code;
        if (payload.title !== undefined) line.titleSnapshot = payload.title;
        if (payload.total_minor !== undefined) line.total = payload.total_minor;
        await line.save();
        await this.recomputeTotals(order);
        return this.respondWithOrder(order);
    }

    async deleteShippingLine(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const lineId = Number(ctx.params.lineId);
        const line = await OrderShippingLine.query().where("order_id", Number(order.id)).where("id", lineId).first();
        if (!line) {
            throw new Exception("Shipping line not found", { status: 404, code: "E_NOT_FOUND" });
        }
        await line.delete();
        await this.recomputeTotals(order);
        return this.respondWithOrder(order);
    }

    async applyCoupon(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminOrderCouponApplyValidator);
        const code = payload.code.trim().toLowerCase();
        const coupon = await Coupon.query().whereRaw("LOWER(code) = ?", [code]).first();
        if (!coupon) {
            throw new Exception("Coupon not found", { status: 404, code: "E_COUPON_NOT_FOUND" });
        }
        const existing = await OrderCouponLine.query()
            .where("order_id", Number(order.id))
            .whereRaw("LOWER(code_snapshot) = ?", [code])
            .first();
        if (existing) {
            throw new Exception("Coupon already applied", { status: 409, code: "E_COUPON_DUPLICATE" });
        }
        const line = new OrderCouponLine();
        line.orderId = order.id;
        line.codeSnapshot = coupon.code;
        line.couponId = coupon.id;
        const discount = this.estimateCouponDiscount(order, coupon);
        line.discount = discount;
        line.discountTax = 0;
        await line.save();
        await this.recomputeTotals(order);
        ctx.response.status(201);
        return this.respondWithOrder(order);
    }

    async removeCoupon(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const code = String(ctx.params.code ?? "").toLowerCase();
        const line = await OrderCouponLine.query()
            .where("order_id", Number(order.id))
            .whereRaw("LOWER(code_snapshot) = ?", [code])
            .first();
        if (!line) {
            throw new Exception("Coupon not applied", { status: 404, code: "E_NOT_FOUND" });
        }
        await line.delete();
        await this.recomputeTotals(order);
        return this.respondWithOrder(order);
    }

    async recalculateTotals(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminOrderRecalculateValidator);
        if (payload.preview === true) {
            const preview = await this.previewTotals(order);
            return { data: { preview, current: this.snapshotTotals(order) } };
        }
        await this.recomputeTotals(order);
        return this.respondWithOrder(order);
    }

    async updateHeader(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminOrderHeaderUpdateValidator);
        if (payload.created_at !== undefined) {
            const parsed = DateTime.fromISO(payload.created_at);
            if (!parsed.isValid) {
                throw new Exception("Invalid created_at", { status: 422, code: "E_VALIDATION_ERROR" });
            }
            order.createdAt = parsed;
        }
        if (payload.customer_id !== undefined) {
            if (payload.customer_id !== null) {
                const exists = await Customer.find(payload.customer_id);
                if (!exists) {
                    throw new Exception("Customer not found", { status: 422, code: "E_CUSTOMER_MISSING" });
                }
            }
            order.customerId = payload.customer_id ?? null;
        }
        if (payload.billing_email !== undefined) order.billingEmail = payload.billing_email ?? null;
        if (payload.is_locked !== undefined) {
            order.attributes = {
                ...((order.attributes as Record<string, unknown>) ?? {}),
                unlock_override: payload.is_locked === false,
            };
        }
        await order.save();
        return this.respondWithOrder(order);
    }

    async upsertMeta(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminOrderMetaUpsertValidator);
        const key = payload.key.trim();
        const value = payload.value ?? "";
        const existing = await OrderMeta.query().where("order_id", Number(order.id)).where("key", key).first();
        if (existing) {
            existing.value = value;
            await existing.save();
        } else {
            const row = new OrderMeta();
            row.orderId = order.id;
            row.key = key;
            row.value = value;
            await row.save();
        }
        return this.respondWithOrder(order);
    }

    async deleteMeta(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const rawKey = String(ctx.params.key ?? "");
        const key = decodeURIComponent(rawKey);
        const row = await OrderMeta.query().where("order_id", Number(order.id)).where("key", key).first();
        if (!row) {
            throw new Exception("Meta key not found", { status: 404, code: "E_NOT_FOUND" });
        }
        await row.delete();
        return this.respondWithOrder(order);
    }

    async customerStats(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        ctx.response.header("cache-control", "private, max-age=60");
        if (order.customerId === null || order.customerId === undefined) {
            return {
                data: {
                    lifetime_order_count: 0,
                    lifetime_revenue_minor: 0,
                    average_order_value_minor: 0,
                },
            };
        }
        const row = (await currentTrx()
            .from("orders")
            .whereNull("deleted_at")
            .where("customer_id", Number(order.customerId))
            .whereIn("status", ["completed", "processing", "refunded"])
            .count("* as count")
            .sum("grand_total as revenue")
            .first()) as { count: string | number; revenue: string | number | null } | undefined;
        const count = Number(row?.count ?? 0);
        const revenue = Number(row?.revenue ?? 0);
        const aov = count === 0 ? 0 : Math.floor(revenue / count);
        return {
            data: {
                lifetime_order_count: count,
                lifetime_revenue_minor: revenue,
                average_order_value_minor: aov,
            },
        };
    }

    private async respondWithOrder(order: Order) {
        await order.refresh();
        await this.loadForResponse(order);
        await CacheInvalidation.customerChanged(currentTenantId(), order.customerId as bigint | number | null | undefined);
        return { data: new OrderTransformer(order).forAdmin() };
    }

    private async loadForResponse(order: Order): Promise<void> {
        await order.load("lineItems");
        await order.load("billingAddress");
        await order.load("shippingAddress");
        await order.load("shippingLines");
        await order.load("taxLines");
        await order.load("statusHistory");
        await order.load("couponLines");
        await order.load("feeLines");
        await order.load("meta");
    }

    private async findOrFail(rawId: unknown): Promise<Order> {
        const numericId = Number(rawId);
        if (!Number.isFinite(numericId)) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const order = await Order.query().where("id", numericId).whereNull("deleted_at").first();
        if (!order) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }
        return order;
    }

    /**
     * Simple line-sum recalculation. Re-runs the math without invoking the full tax engine — fine
     * for admin-side edits where the operator typically tweaks quantities or prices and trusts
     * the existing tax snapshots. A tax-aware variant lives in {@link cartTotalsService} and is
     * the path we'd swap in when the recalc dialog grows a "Recompute tax too" toggle.
     */
    private async recomputeTotals(order: Order): Promise<void> {
        await order.load("lineItems");
        await order.load("shippingLines");
        await order.load("feeLines");
        await order.load("couponLines");
        await order.load("taxLines");
        const totals = this.calculateTotals(order);
        order.itemsTotal = totals.itemsTotal;
        order.itemsTaxTotal = totals.itemsTaxTotal;
        order.shippingTotal = totals.shippingTotal;
        order.shippingTaxTotal = totals.shippingTaxTotal;
        order.feesTotal = totals.feesTotal;
        order.feesTaxTotal = totals.feesTaxTotal;
        order.discountTotal = totals.discountTotal;
        order.discountTaxTotal = totals.discountTaxTotal;
        order.taxTotal = totals.taxTotal;
        order.grandTotal = totals.grandTotal;
        await order.save();
    }

    private async previewTotals(order: Order) {
        await order.load("lineItems");
        await order.load("shippingLines");
        await order.load("feeLines");
        await order.load("couponLines");
        await order.load("taxLines");
        return this.calculateTotals(order);
    }

    private calculateTotals(order: Order) {
        const lineItems = (order as Order & { lineItems?: OrderLineItem[] }).lineItems ?? [];
        const shippingLines = (order as Order & { shippingLines?: OrderShippingLine[] }).shippingLines ?? [];
        const feeLines = (order as Order & { feeLines?: OrderFeeLine[] }).feeLines ?? [];
        const couponLines = (order as Order & { couponLines?: OrderCouponLine[] }).couponLines ?? [];

        const itemsTotal = lineItems.reduce((sum, line) => sum + Number(line.total), 0);
        const itemsTaxTotal = lineItems.reduce((sum, line) => sum + Number(line.totalTax), 0);
        const shippingTotal = shippingLines.reduce((sum, line) => sum + Number(line.total), 0);
        const shippingTaxTotal = shippingLines.reduce((sum, line) => sum + Number(line.totalTax), 0);
        const feesTotal = feeLines.reduce((sum, fee) => sum + Number(fee.total), 0);
        const feesTaxTotal = feeLines.reduce((sum, fee) => sum + Number(fee.totalTax), 0);
        const discountTotal = couponLines.reduce((sum, line) => sum + Number(line.discount), 0);
        const discountTaxTotal = couponLines.reduce((sum, line) => sum + Number(line.discountTax), 0);
        const taxTotal = itemsTaxTotal + shippingTaxTotal + feesTaxTotal - discountTaxTotal;
        const grandTotal = itemsTotal + shippingTotal + feesTotal + taxTotal - discountTotal;

        return {
            itemsTotal,
            itemsTaxTotal,
            shippingTotal,
            shippingTaxTotal,
            feesTotal,
            feesTaxTotal,
            discountTotal,
            discountTaxTotal,
            taxTotal,
            grandTotal,
        };
    }

    private snapshotTotals(order: Order) {
        return {
            itemsTotal: Number(order.itemsTotal),
            itemsTaxTotal: Number(order.itemsTaxTotal),
            shippingTotal: Number(order.shippingTotal),
            shippingTaxTotal: Number(order.shippingTaxTotal),
            feesTotal: Number(order.feesTotal),
            feesTaxTotal: Number(order.feesTaxTotal),
            discountTotal: Number(order.discountTotal),
            discountTaxTotal: Number(order.discountTaxTotal),
            taxTotal: Number(order.taxTotal),
            grandTotal: Number(order.grandTotal),
        };
    }

    /**
     * Best-effort estimate when the existing discounter pipeline isn't directly accessible from a
     * server-side admin add — percent → applied against `items_total`, fixed_cart → flat, free
     * shipping → 0 (the shipping line is the actual benefit). Real-world drift gets corrected by
     * the subsequent `recomputeTotals` pass once the operator confirms.
     */
    private estimateCouponDiscount(order: Order, coupon: Coupon): number {
        const itemsTotal = Number(order.itemsTotal);
        if (coupon.discountType === "percent" && coupon.amountPercent !== null && coupon.amountPercent !== undefined) {
            return Math.floor((itemsTotal * Number(coupon.amountPercent)) / 100);
        }
        if (coupon.discountType === "fixed_cart" && coupon.amountMinor !== null && coupon.amountMinor !== undefined) {
            return Number(coupon.amountMinor);
        }
        return 0;
    }
}
