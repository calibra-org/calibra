import vine from "@vinejs/vine";

export const loginValidator = vine.compile(
    vine.object({
        email: vine.string().trim().email().maxLength(254),
        password: vine.string().minLength(1).maxLength(128),
    }),
);
