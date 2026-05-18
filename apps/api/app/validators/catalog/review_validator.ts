import vine from "@vinejs/vine";

export const createReviewValidator = vine.compile(
    vine.object({
        reviewer_name: vine.string().trim().minLength(1).maxLength(200),
        reviewer_email: vine.string().trim().email().maxLength(320),
        body: vine.string().trim().minLength(10).maxLength(5000),
        rating: vine.number().min(1).max(5),
    }),
);

export const moderateReviewValidator = vine.compile(
    vine.object({
        status: vine.enum(["pending", "approved", "spam", "trash"]),
    }),
);
