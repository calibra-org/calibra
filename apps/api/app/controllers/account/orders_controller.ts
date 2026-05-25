import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { viewOrder } from "#abilities/main";
import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import OrderTransformer from "#transformers/order_transformer";

const DEFAULT_PER_PAGE = 20;

/**
 * `GET /api/v1/account/orders`. The list endpoint filters at the SQL layer (Bouncer would
 * be wasteful here); the detail endpoint loads the row by id, then authorises with the
 * {@link viewOrder} ability so a cross-tenant probe yields 403, not 404.
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
            .preload("lineItems")
            .preload("billingAddress")
            .preload("shippingAddress")
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
        const numericId = Number(ctx.params.id);
        if (!Number.isFinite(numericId)) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const order = await Order.query()
            .where("id", numericId)
            .whereNot("status", OrderStatus.Draft)
            .whereNull("deleted_at")
            .preload("lineItems")
            .preload("billingAddress")
            .preload("shippingAddress")
            .preload("shippingLines")
            .preload("taxLines")
            .preload("statusHistory")
            .first();
        if (!order) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }

        await ctx.bouncer.authorize(viewOrder, order);

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
