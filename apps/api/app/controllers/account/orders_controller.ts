import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import OrderTransformer from "#transformers/order_transformer";

const DEFAULT_PER_PAGE = 20;

/**
 * `GET /api/v1/account/orders`. Returns the authenticated customer's orders, excluding drafts and
 * soft-deleted rows. Cross-tenant access produces a 404, never a 403, so probes cannot enumerate
 * other customers' order ids.
 */
export default class AccountOrdersController {
    async index(ctx: HttpContext) {
        const customer = await this.requireCustomer(ctx);
        const page = Number(ctx.request.input("page", 1)) || 1;
        const perPage = Math.min(Number(ctx.request.input("perPage", DEFAULT_PER_PAGE)) || DEFAULT_PER_PAGE, 100);

        const paginator = await Order.query()
            .where("customer_id", Number(customer.id))
            .whereNot("status", OrderStatus.Draft)
            .whereNull("deleted_at")
            .orderBy("id", "desc")
            .paginate(page, perPage);

        const meta = paginator.getMeta();
        return {
            data: paginator.all().map((order) => new OrderTransformer(order).forList()),
            meta: {
                page: meta.currentPage,
                perPage: meta.perPage,
                total: meta.total,
                lastPage: meta.lastPage,
            },
        };
    }

    async show(ctx: HttpContext) {
        const customer = await this.requireCustomer(ctx);
        const numericId = Number(ctx.params.id);
        if (!Number.isFinite(numericId)) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const order = await Order.query()
            .where("id", numericId)
            .where("customer_id", Number(customer.id))
            .whereNot("status", OrderStatus.Draft)
            .whereNull("deleted_at")
            .first();
        if (!order) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }

        await order.load("lineItems");
        await order.load("billingAddress");
        await order.load("shippingAddress");
        await order.load("shippingLines");
        await order.load("taxLines");
        await order.load("statusHistory");

        return { data: new OrderTransformer(order).forDetail() };
    }

    private async requireCustomer(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await user.load("customer");
        const customer = user.customer;
        if (!customer) {
            throw new Exception("Customer profile missing", { status: 404, code: "E_CUSTOMER_MISSING" });
        }
        return customer;
    }
}
