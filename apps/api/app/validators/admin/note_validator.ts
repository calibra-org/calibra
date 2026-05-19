import vine from "@vinejs/vine";

export const adminNoteCreateValidator = vine.compile(
    vine.object({
        body: vine.string().trim().minLength(1).maxLength(10_000),
        visibility: vine.enum(["internal", "customer"] as const),
        send_email: vine.boolean().optional(),
    }),
);

export const adminNoteListValidator = vine.compile(
    vine.object({
        type: vine.enum(["any", "customer", "internal"] as const).optional(),
        page: vine.number().positive().optional(),
        perPage: vine.number().positive().max(100).optional(),
    }),
);
