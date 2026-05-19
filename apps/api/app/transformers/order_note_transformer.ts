import { BaseTransformer } from "@adonisjs/core/transformers";

import type OrderNote from "#models/order_note";

/**
 * `forAdmin` variant returns the full row including `visibility` + `author_user_id`. `forCustomer`
 * strips internal-only fields — controllers MUST also filter the query to `visibility = 'customer'`
 * before piping rows through this variant; this transformer guards the field set, not the row set.
 */
export default class OrderNoteTransformer extends BaseTransformer<OrderNote> {
    toObject() {
        return this.forAdmin();
    }

    forAdmin() {
        const note = this.resource;
        return {
            id: Number(note.id),
            order_id: Number(note.orderId),
            body: note.body,
            visibility: note.visibility,
            author_user_id: note.authorUserId === null ? null : Number(note.authorUserId),
            created_at: note.createdAt?.toISO() ?? null,
        };
    }

    forCustomer() {
        const note = this.resource;
        return {
            id: Number(note.id),
            body: note.body,
            created_at: note.createdAt?.toISO() ?? null,
        };
    }
}
