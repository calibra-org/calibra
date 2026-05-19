import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import OrderStatusHistory from "#models/order_status_history";
import OrderStatusHistoryTransformer from "#transformers/order_status_history_transformer";

/**
 * `GET /api/v1/account/orders/:id/history`. Returns the public-safe order timeline — `forCustomer`
 * drops `changed_by_user_id` + `reason` (free text that may contain internal context) and adds a
 * `label_key` the storefront resolves through its own next-intl catalog (Pattern 4 — API never
 * returns translated labels, only the key + raw value).
 */
export default class AccountOrderHistoryController {
    async index(ctx: HttpContext) {
        const order = await this.findCustomerOrderOrFail(ctx);
        const rows = await OrderStatusHistory.query().where("order_id", Number(order.id)).orderBy("occurred_at", "asc");
        return {
            data: rows.map((row) => new OrderStatusHistoryTransformer(row).forCustomer()),
        };
    }

    private async findCustomerOrderOrFail(ctx: HttpContext): Promise<Order> {
        const user = ctx.auth.getUserOrFail();
        await user.load("customer");
        const customer = user.customer;
        if (!customer) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }
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
        return order;
    }
}
