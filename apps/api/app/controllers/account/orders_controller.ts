import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { viewOrder } from "#abilities/main";
import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import { accountOrdersView } from "#table_views/account/orders";
import OrderTransformer from "#transformers/order_transformer";

/** Strict mode: any non-TableView query key returns 422. */
const accountOrdersListValidator = accountOrdersView.compileStrict();

/**
 * `GET /api/v1/account/orders`. The list endpoint filters at the SQL layer (Bouncer would
 * be wasteful here); the detail endpoint loads the row by id, then authorises with the
 * {@link viewOrder} ability so a cross-tenant probe yields 403, not 404.
 */
export default class AccountOrdersController {
    async index(ctx: HttpContext) {
        const customer = await this.requireCustomer(ctx);
        const parsed = await accountOrdersListValidator.validate(ctx.request.qs());

        const builder = Order.query()
            .where("customer_id", Number(customer.id))
            .whereNot("status", OrderStatus.Draft)
            .whereNull("deleted_at")
            .preload("lineItems")
            .preload("billingAddress")
            .preload("shippingAddress");

        const { data, meta } = await accountOrdersView.run<Order>(builder, parsed);

        return {
            data: data.map((order) => new OrderTransformer(order).forList()),
            meta,
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
