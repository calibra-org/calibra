import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import logger from "@adonisjs/core/services/logger";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import { isOrderStatus, ORDER_STATUS_VALUES, OrderStatus } from "#enums/order_status";
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
    adminOrderMarkShippedValidator,
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
        const sort = parseSort(payload.sort);
        const includeTrashed = payload.status === "trashed";

        const query = Order.query();
        if (!includeTrashed) query.whereNull("orders.deleted_at");
        else query.whereNotNull("orders.deleted_at");

        if (payload.status && payload.status !== "trashed") query.where("status", payload.status);
        if (payload.customer_id !== undefined) query.where("customer_id", payload.customer_id);
        if (payload.created_via) query.where("created_via", payload.created_via);
        if (payload.source && payload.source.length > 0) query.whereIn("created_via", payload.source);
        if (payload.payment && payload.payment.length > 0) query.whereIn("payment_method_code_snapshot", payload.payment);
        if (payload.country && payload.country.length > 0) {
            const upper = payload.country.map((code) => code.toUpperCase());
            query.whereExists((sub) => {
                sub.from("order_addresses")
                    .whereRaw('"order_addresses"."order_id" = "orders"."id"')
                    .where("kind", "billing")
                    .whereIn(db.raw('UPPER("order_addresses"."country")') as unknown as string, upper);
            });
        }
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

        query.preload("lineItems").preload("couponLines");
        query.orderBy(sort.column, sort.direction);
        if (sort.column !== "id") query.orderBy("id", "desc");

        const paginator = await query.paginate(page, perPage);
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

    /**
     * Grouped status counts used by the admin Orders tab strip. Single SQL pass — one row per status
     * across the entire `orders` table (excluding soft-deleted rows, with `trashed` as the
     * deleted-bucket aggregate). Returned as `{ all, draft, pending, on_hold, processing, completed,
     * cancelled, refunded, failed, trashed }`.
     */
    async counts(ctx: HttpContext) {
        const liveRows = (await db
            .from("orders")
            .whereNull("deleted_at")
            .groupBy("status")
            .select("status")
            .count("* as count")) as {
            status: string;
            count: string | number;
        }[];
        const trashedRow = (await db.from("orders").whereNotNull("deleted_at").count("* as count").first()) as
            | { count: string | number }
            | undefined;

        const counts: Record<string, number> = { all: 0, trashed: Number(trashedRow?.count ?? 0) };
        for (const status of ORDER_STATUS_VALUES) counts[status] = 0;
        for (const row of liveRows) {
            const status = String(row.status);
            counts[status] = Number(row.count);
            counts.all += Number(row.count);
        }

        ctx.response.header("cache-control", "private, max-age=10");
        return { data: counts };
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

    /**
     * Marks a processing order as shipped — stamps `date_completed_at`, persists tracking metadata
     * on `attributes.shipping`, transitions the order to `completed`, and queues a customer email
     * (currently a structured log line until the mailer ships). Re-runs are idempotent: a tracking
     * update on an already-shipped order overwrites the metadata without re-triggering the
     * transition or the email.
     */
    async markShipped(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminOrderMarkShippedValidator);
        const alreadyShipped = order.status === OrderStatus.Completed;

        const shippingAttr = {
            tracking_number: payload.tracking_number ?? null,
            tracking_url: payload.tracking_url ?? null,
            carrier: payload.carrier ?? null,
            shipped_at: alreadyShipped
                ? (((order.attributes as Record<string, unknown>)?.shipping as Record<string, unknown> | undefined)?.shipped_at ??
                  DateTime.utc().toISO())
                : DateTime.utc().toISO(),
        };
        order.attributes = { ...((order.attributes as Record<string, unknown>) ?? {}), shipping: shippingAttr };
        await order.save();

        if (!alreadyShipped && order.status === OrderStatus.Processing) {
            await orderStateMachine.transition(order, OrderStatus.Completed, {
                actor: ctx.auth.user,
                reason: payload.tracking_number ? `Shipped — ${payload.tracking_number}` : "Marked shipped",
            });
            if (payload.notify_customer !== false) {
                logger.info(
                    {
                        order_id: Number(order.id),
                        to: order.billingEmail,
                        tracking_number: payload.tracking_number ?? null,
                    },
                    "order.shipping.email_queued (stub)",
                );
            }
        }

        await order.refresh();
        await this.loadForResponse(order);
        return { data: new OrderTransformer(order).forAdmin() };
    }

    /**
     * Re-sends the order confirmation email. No mailer is bound yet, so we just log a structured
     * stub the way `order_notes_controller.store` does — the contract is established so the
     * dispatcher can swap in once templates land. Returns 202 to advertise the async semantics.
     */
    async resendConfirmation(ctx: HttpContext) {
        const order = await this.findOrFail(ctx.params.id);
        logger.info(
            {
                order_id: Number(order.id),
                to: order.billingEmail,
                kind: "order_confirmation",
            },
            "order.confirmation.email_queued (stub)",
        );
        ctx.response.status(202);
        return { data: { order_id: Number(order.id), queued: true } };
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
        await order.load("couponLines");
    }
}

/**
 * Maps the wire `sort=` field (e.g. `date`, `-total`, `order`) to a `(column, direction)` pair
 * the query builder understands. Hyphen prefix → descending. Unknown columns fall back to
 * `(id, desc)` so a stale URL parameter never throws.
 */
function parseSort(raw: string | null | undefined): { column: string; direction: "asc" | "desc" } {
    if (typeof raw !== "string" || raw.length === 0) return { column: "id", direction: "desc" };
    const direction = raw.startsWith("-") ? "desc" : "asc";
    const key = raw.replace(/^-/, "");
    const column = SORT_COLUMN_MAP[key];
    if (column === undefined) return { column: "id", direction: "desc" };
    return { column, direction };
}

const SORT_COLUMN_MAP: Record<string, string> = {
    id: "id",
    order: "order_number",
    order_number: "order_number",
    date: "created_at",
    created_at: "created_at",
    total: "grand_total",
    grand_total: "grand_total",
    status: "status",
    paid: "date_paid_at",
    completed: "date_completed_at",
};
