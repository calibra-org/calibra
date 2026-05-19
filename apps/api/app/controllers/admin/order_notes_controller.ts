import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import logger from "@adonisjs/core/services/logger";

import Order from "#models/order";
import OrderNote from "#models/order_note";
import OrderNoteTransformer from "#transformers/order_note_transformer";
import { adminNoteCreateValidator, adminNoteListValidator } from "#validators/admin/note_validator";

const DEFAULT_PER_PAGE = 25;

/**
 * Admin notes surface. List + create + delete; the customer-side endpoint lives in
 * `app/controllers/account/order_notes_controller.ts` and filters to `visibility='customer'` rows.
 * Internal notes never leave this controller. `send_email=true` + `visibility='customer'` logs to
 * stdout in MVP — the queue + template integration is deferred until a mailer ships.
 */
export default class AdminOrderNotesController {
    async index(ctx: HttpContext) {
        const order = await this.findOrderOrFail(ctx.params.order_id);
        const payload = await ctx.request.validateUsing(adminNoteListValidator);
        const type = payload.type ?? "any";
        const page = payload.page ?? 1;
        const perPage = payload.perPage ?? DEFAULT_PER_PAGE;

        const query = OrderNote.query().where("order_id", Number(order.id));
        if (type !== "any") query.where("visibility", type);

        const paginator = await query.orderBy("id", "desc").paginate(page, perPage);
        const meta = paginator.getMeta();
        return {
            data: paginator.all().map((note) => new OrderNoteTransformer(note).forAdmin()),
            meta: {
                page: meta.currentPage,
                perPage: meta.perPage,
                total: meta.total,
                lastPage: meta.lastPage,
            },
        };
    }

    async store(ctx: HttpContext) {
        const order = await this.findOrderOrFail(ctx.params.order_id);
        const payload = await ctx.request.validateUsing(adminNoteCreateValidator);

        const note = new OrderNote();
        note.orderId = order.id;
        note.body = payload.body;
        note.visibility = payload.visibility;
        note.authorUserId = ctx.auth.user?.id ?? null;
        note.attributes = {};
        await note.save();

        if (payload.send_email && payload.visibility === "customer") {
            /**
             * No mailer is bound yet — log a structured stub so we can spot stuck queues later
             * without losing the request. Swap the logger call for the real mail dispatch when
             * the email templates land; the note row is already persisted.
             */
            logger.info(
                {
                    order_id: Number(order.id),
                    note_id: Number(note.id),
                    to: order.billingEmail,
                },
                "order.note.email_queued (stub)",
            );
        }

        ctx.response.status(201);
        return { data: new OrderNoteTransformer(note).forAdmin() };
    }

    async destroy(ctx: HttpContext) {
        const order = await this.findOrderOrFail(ctx.params.order_id);
        const note = await OrderNote.query().where("id", Number(ctx.params.id)).where("order_id", Number(order.id)).first();
        if (!note) {
            throw new Exception("Note not found", { status: 404, code: "E_NOT_FOUND" });
        }
        await note.delete();
        return ctx.response.noContent();
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
