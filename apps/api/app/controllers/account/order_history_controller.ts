import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { viewOrder } from "#abilities/main";
import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import OrderStatusHistory from "#models/order_status_history";
import OrderStatusHistoryTransformer from "#transformers/order_status_history_transformer";

/**
 * `GET /api/v1/account/orders/:id/history`. Returns the public-safe timeline through
 * `forCustomer` (drops `changed_by_user_id` + free-text `reason`). Authorization is gated by
 * the {@link viewOrder} ability so a probe against another tenant's order yields 403.
 */
export default class AccountOrderHistoryController {
    async index(ctx: HttpContext) {
        const order = await this.findOrderOrFail(ctx);
        await ctx.bouncer.authorize(viewOrder, order);
        const rows = await OrderStatusHistory.query().where("order_id", Number(order.id)).orderBy("occurred_at", "asc");
        return {
            data: rows.map((row) => new OrderStatusHistoryTransformer(row).forCustomer()),
        };
    }

    private async findOrderOrFail(ctx: HttpContext): Promise<Order> {
        const numericId = Number(ctx.params.id);
        if (!Number.isFinite(numericId)) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const order = await Order.query()
            .where("id", numericId)
            .whereNot("status", OrderStatus.Draft)
            .whereNull("deleted_at")
            .first();
        if (!order) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }
        return order;
    }
}
