import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import { isOrderStatus, OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import OrderAddress from "#models/order_address";
import OrderLineItem from "#models/order_line_item";
import PaymentGateway from "#models/payment_gateway";
import Product from "#models/product";
import ProductVariation from "#models/product_variation";
import { orderNumberService } from "#services/order_number_service";
import { orderStateMachine } from "#services/order_state_machine";
import OrderTransformer from "#transformers/order_transformer";
import {
    adminOrderBatchValidator,
    adminOrderCreateValidator,
    adminOrderListValidator,
    adminOrderStatusValidator,
    adminOrderUpdateValidator,
} from "#validators/admin/order_validator";

const DEFAULT_PER_PAGE = 20;

/**
 * Admin CRUD over `orders`. List + search + filter, single-resource show, manual creation, header
 * patches, soft-delete, status transitions (delegated to `OrderStateMachine`), and a batch
 * endpoint. Reading historical orders works even for soft-deleted customers because the customer
 * FK uses `ON DELETE RESTRICT` — the customer's `deleted_at` flag is informational only.
 */
export default class AdminOrdersController {
    async index(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminOrderListValidator);
        const page = payload.page ?? 1;
        const perPage = payload.perPage ?? DEFAULT_PER_PAGE;

        const query = Order.query().whereNull("orders.deleted_at");

        if (payload.status) query.where("status", payload.status);
        if (payload.customer_id !== undefined) query.where("customer_id", payload.customer_id);
        if (payload.created_via) query.where("created_via", payload.created_via);
        if (payload.search) {
            const needle = `%${payload.search.toLowerCase()}%`;
            const numeric = Number(payload.search);
            query.where((q) => {
                q.whereRaw("LOWER(COALESCE(billing_email, '')) LIKE ?", [needle]);
                if (Number.isFinite(numeric)) {
                    q.orWhere("order_number", numeric).orWhere("id", numeric);
                }
            });
        }
        if (payload.after) query.where("created_at", ">=", payload.after);
        if (payload.before) query.where("created_at", "<=", payload.before);

        const paginator = await query.orderBy("id", "desc").paginate(page, perPage);
        const meta = paginator.getMeta();

        return {
            data: paginator.all().map((o) => new OrderTransformer(o).forList()),
            meta: {
                page: meta.currentPage,
                perPage: meta.perPage,
                total: meta.total,
                lastPage: meta.lastPage,
            },
        };
    }

    async show(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        return { data: new OrderTransformer(order).forAdmin() };
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminOrderCreateValidator);
        const gateway = await PaymentGateway.find(payload.payment_gateway_id);
        if (!gateway) {
            throw new Exception("Payment method is unavailable", {
                status: 422,
                code: "E_PAYMENT_GATEWAY_INVALID",
            });
        }

        const order = await db.transaction(async (trx) => {
            const created = new Order();
            created.useTransaction(trx);
            created.orderNumber = await orderNumberService.allocate(trx);
            created.status = OrderStatus.Draft;
            created.customerId = payload.customer_id ?? null;
            created.currency = "IRR";
            created.currencyDisplay = "IRT";
            created.pricesIncludeTax = true;
            created.createdVia = "admin";
            created.paymentGatewayIdSnapshot = gateway.id;
            created.paymentMethodCodeSnapshot = gateway.code;
            created.paymentMethodTitleSnapshot = gateway.code;
            created.customerNote = payload.customer_note ?? null;
            created.billingEmail = payload.billing_address.email ?? null;
            await created.save();

            await this.writeAddress(trx, created, "billing", payload.billing_address);
            if (payload.shipping_address) {
                await this.writeAddress(trx, created, "shipping", payload.shipping_address);
            }

            let itemsTotal = 0;
            for (const line of payload.lines) {
                const product = await Product.find(line.product_id, { client: trx });
                if (!product) {
                    throw new Exception(`Product ${line.product_id} not found`, {
                        status: 422,
                        code: "E_PRODUCT_MISSING",
                    });
                }
                const variation =
                    line.variation_id === undefined || line.variation_id === null
                        ? null
                        : await ProductVariation.find(line.variation_id, { client: trx });
                const lineItem = new OrderLineItem();
                lineItem.useTransaction(trx);
                lineItem.orderId = created.id;
                lineItem.productId = product.id;
                lineItem.variationId = variation === null ? null : variation.id;
                const translation = await product.related("translations").query().useTransaction(trx).first();
                lineItem.nameSnapshot = translation?.name ?? `#${product.id}`;
                lineItem.skuSnapshot = variation?.sku ?? product.sku ?? null;
                lineItem.quantity = line.quantity;
                const price = Number(variation?.regularPrice ?? product.regularPrice ?? 0);
                lineItem.priceSnapshot = price;
                const gross = price * line.quantity;
                lineItem.subtotal = gross;
                lineItem.subtotalTax = 0;
                lineItem.total = gross;
                lineItem.totalTax = 0;
                lineItem.taxClassIdSnapshot = product.taxClassId ?? null;
                lineItem.attributesSnapshot = {};
                await lineItem.save();
                itemsTotal += gross;
            }

            created.itemsTotal = itemsTotal;
            created.grandTotal = itemsTotal;
            await created.save();
            return created;
        });

        ctx.response.status(201);
        await order.refresh();
        await this.loadForResponse(order);
        return { data: new OrderTransformer(order).forAdmin() };
    }

    async update(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminOrderUpdateValidator);
        if (payload.customer_note !== undefined) order.customerNote = payload.customer_note ?? null;
        if (payload.billing_email !== undefined) order.billingEmail = payload.billing_email ?? null;
        await order.save();
        await this.loadForResponse(order);
        return { data: new OrderTransformer(order).forAdmin() };
    }

    async destroy(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        order.deletedAt = DateTime.utc();
        await order.save();
        return ctx.response.noContent();
    }

    async transitionStatus(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminOrderStatusValidator);
        if (!isOrderStatus(payload.to_status)) {
            throw new Exception("Unknown status value", { status: 422, code: "E_VALIDATION_ERROR" });
        }
        await orderStateMachine.transition(order, payload.to_status, {
            actor: ctx.auth.user,
            reason: payload.reason ?? null,
        });
        await order.refresh();
        await this.loadForResponse(order);
        return { data: new OrderTransformer(order).forAdmin() };
    }

    async batch(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminOrderBatchValidator);
        const result = await db.transaction(async (trx) => {
            const updated: Order[] = [];
            const deletedIds: Array<bigint | number> = [];
            for (const patch of payload.update ?? []) {
                const order = await Order.find(patch.id, { client: trx });
                if (!order) {
                    throw new Exception(`Order ${patch.id} not found`, { status: 404, code: "E_NOT_FOUND" });
                }
                if (patch.customer_note !== undefined) order.customerNote = patch.customer_note ?? null;
                if (patch.billing_email !== undefined) order.billingEmail = patch.billing_email ?? null;
                await order.save();
                updated.push(order);
            }
            const now = DateTime.utc();
            for (const id of payload.delete ?? []) {
                const order = await Order.find(id, { client: trx });
                if (!order) {
                    throw new Exception(`Order ${id} not found`, { status: 404, code: "E_NOT_FOUND" });
                }
                order.deletedAt = now;
                await order.save();
                deletedIds.push(id);
            }
            return { updated, deletedIds };
        });

        return {
            data: {
                updated: result.updated.map((o) => new OrderTransformer(o).forList()),
                deleted: result.deletedIds,
            },
        };
    }

    private async writeAddress(
        trx: any,
        order: Order,
        kind: "billing" | "shipping",
        payload: {
            first_name: string;
            last_name: string;
            company?: string | null;
            address_line_1: string;
            address_line_2?: string | null;
            city: string;
            region_id?: number | null;
            region_text?: string | null;
            postcode?: string | null;
            country: string;
            phone?: string | null;
            email?: string | null;
        },
    ): Promise<void> {
        const row = new OrderAddress();
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
        row.email = payload.email ?? null;
        row.attributes = {};
        await row.save();
    }

    private async findOrFail(id: unknown): Promise<Order> {
        const numericId = Number(id);
        if (!Number.isFinite(numericId)) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const order = await Order.query().where("id", numericId).whereNull("deleted_at").first();
        if (!order) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }
        await this.loadForResponse(order);
        return order;
    }

    private async loadForResponse(order: Order): Promise<void> {
        await order.load("lineItems");
        await order.load("billingAddress");
        await order.load("shippingAddress");
        await order.load("shippingLines");
        await order.load("taxLines");
        await order.load("statusHistory");
    }
}
