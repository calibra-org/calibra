import vine from "@vinejs/vine";

export const factorPublicPaymentInitValidator = vine.compile(
    vine.object({
        gateway_id: vine.number().withoutDecimals().positive().optional(),
    }),
);
