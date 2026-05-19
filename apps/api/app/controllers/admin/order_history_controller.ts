import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import Order from "#models/order";
import OrderStatusHistory from "#models/order_status_history";
import OrderStatusHistoryTransformer from "#transformers/order_status_history_transformer";

/**
 * Admin status-history endpoint. Rows are written by `OrderStateMachine.transition()` (phase 05);
 * this controller is read-only — `forAdmin` returns the full audit row including actor_user_id +
 * free-text reason.
 */
export default class AdminOrderHistoryController {
    async index(ctx: HttpContext) {
        const order = await this.findOrderOrFail(ctx.params.order_id);
        const rows = await OrderStatusHistory.query().where("order_id", Number(order.id)).orderBy("occurred_at", "asc");
        return {
            data: rows.map((row) => new OrderStatusHistoryTransformer(row).forAdmin()),
        };
    }

    private async findOrderOrFail(rawId: unknown): Promise<Order> {
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
}
