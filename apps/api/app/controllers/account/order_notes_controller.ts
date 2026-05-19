import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import OrderNote from "#models/order_note";
import OrderNoteTransformer from "#transformers/order_note_transformer";

/**
 * `GET /api/v1/account/orders/:id/notes`. Returns only `visibility='customer'` rows. The query
 * filter is the actual security guarantee — the `forCustomer` transformer variant additionally
 * strips internal fields (`visibility`, `author_user_id`) so a row that somehow slipped through
 * the filter still wouldn't expose them. Cross-tenant access produces a 404, never a 403.
 */
export default class AccountOrderNotesController {
    async index(ctx: HttpContext) {
        const order = await this.findCustomerOrderOrFail(ctx);
        const rows = await OrderNote.query()
            .where("order_id", Number(order.id))
            .where("visibility", "customer")
            .orderBy("id", "desc");
        return {
            data: rows.map((row) => new OrderNoteTransformer(row).forCustomer()),
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
