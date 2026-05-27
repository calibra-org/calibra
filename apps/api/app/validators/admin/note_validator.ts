import vine from "@vinejs/vine";

import { adminOrderNotesView } from "#table_views/admin/order_notes";

export const adminNoteCreateValidator = vine.compile(
    vine.object({
        body: vine.string().trim().minLength(1).maxLength(10_000),
        visibility: vine.enum(["internal", "customer"] as const),
        send_email: vine.boolean().optional(),
    }),
);

/**
 * Wraps the TableView schema with the legacy `type` keyword (`any`/`customer`/`internal`).
 * `type` is the UI tab name; the controller flips it into a `visibility:eq:...` predicate.
 */
export const adminNoteListValidator = vine.compile(
    vine.object({
        ...adminOrderNotesView.schema.getProperties(),
        type: vine.enum(["any", "customer", "internal"] as const).optional(),
    }),
);
