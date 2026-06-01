import vine from "@vinejs/vine";

/**
 * OTP request: an `identifier` (phone in E.164 or an email) and the delivery `channel`. The
 * identifier is validated loosely on purpose — the endpoint must not reveal whether a given
 * phone/email is registered, so format-only validation keeps the response uniform.
 */
export const otpRequestValidator = vine.compile(
    vine.object({
        identifier: vine.string().trim().minLength(3).maxLength(254),
        channel: vine.enum(["sms", "email"]),
    }),
);

/** OTP verify: the same `identifier` plus the 6-digit `code`. */
export const otpVerifyValidator = vine.compile(
    vine.object({
        identifier: vine.string().trim().minLength(3).maxLength(254),
        code: vine.string().trim().fixedLength(6),
    }),
);
