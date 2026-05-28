import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import Order from "#models/order";
import OrderStatusHistory from "#models/order_status_history";
import { adminOrderHistoryView } from "#table_views/admin/order_history";
import OrderStatusHistoryTransformer from "#transformers/order_status_history_transformer";

const adminOrderHistoryListValidator = adminOrderHistoryView.compileStrict({ defaultLimit: 100 });

/**
 * Admin status-history endpoint. Rows are written by `OrderStateMachine.transition()`; this
 * controller is read-only — `forAdmin` returns the full audit row including `actor_user_id` and
 * the free-text `reason`.
 */
export default class AdminOrderHistoryController {
    async index(ctx: HttpContext) {
        const order = await this.findOrderOrFail(ctx.params.order_id);
        const parsed = await adminOrderHistoryListValidator.validate(ctx.request.qs());
        const builder = OrderStatusHistory.query().where("order_id", Number(order.id));
        const { data: rows, meta } = await adminOrderHistoryView.run<OrderStatusHistory>(builder, parsed);
        return {
            data: rows.map((row) => new OrderStatusHistoryTransformer(row).forAdmin()),
            meta,
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
