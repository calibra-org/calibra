import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { viewOrder } from "#abilities/main";
import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import OrderNote from "#models/order_note";
import OrderNoteTransformer from "#transformers/order_note_transformer";

/**
 * `GET /api/v1/account/orders/:id/notes`. The `forCustomer` transformer variant strips internal
 * fields, so the network response is safe even if filtering ever broke. Authorization runs
 * through the {@link viewOrder} ability — cross-tenant probes yield 403.
 */
export default class AccountOrderNotesController {
    async index(ctx: HttpContext) {
        const order = await this.findOrderOrFail(ctx);
        await ctx.bouncer.authorize(viewOrder, order);
        const rows = await OrderNote.query()
            .where("order_id", Number(order.id))
            .where("visibility", "customer")
            .orderBy("id", "desc");
        return {
            data: rows.map((row) => new OrderNoteTransformer(row).forCustomer()),
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
