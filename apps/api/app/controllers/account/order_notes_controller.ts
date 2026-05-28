import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { viewOrder } from "#abilities/main";
import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import OrderNote from "#models/order_note";
import { accountOrderNotesView } from "#table_views/account/order_notes";
import OrderNoteTransformer from "#transformers/order_note_transformer";

const accountOrderNotesListValidator = accountOrderNotesView.compileStrict({ defaultLimit: 100 });

/**
 * `GET /api/v1/account/orders/:id/notes`. The `forCustomer` transformer variant strips internal
 * fields, so the network response is safe even if filtering ever broke. Authorization runs
 * through the {@link viewOrder} ability — cross-tenant probes yield 403.
 */
export default class AccountOrderNotesController {
    async index(ctx: HttpContext) {
        const order = await this.findOrderOrFail(ctx);
        await ctx.bouncer.authorize(viewOrder, order);
        const parsed = await accountOrderNotesListValidator.validate(ctx.request.qs());
        /** Visibility pre-scope is a security invariant — internal notes must never reach this
         * endpoint regardless of the wire `filter[]`. */
        const builder = OrderNote.query().where("order_id", Number(order.id)).where("visibility", "customer");
        const { data: rows, meta } = await accountOrderNotesView.run<OrderNote>(builder, parsed);
        return {
            data: rows.map((row) => new OrderNoteTransformer(row).forCustomer()),
            meta,
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
