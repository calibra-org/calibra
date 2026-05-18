import vine from "@vinejs/vine";

const passwordRule = vine
    .string()
    .minLength(8)
    .maxLength(128)
    .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/);

/**
 * `email` only — never reveal whether the address exists. The forgot-password controller always
 * returns 200 regardless of lookup result.
 */
export const passwordForgotValidator = vine.compile(
    vine.object({
        email: vine.string().trim().email().maxLength(254),
    }),
);

/**
 * Tokens are 32 random bytes encoded as 64-character lowercase hex. The validator enforces the
 * format so the controller can short-circuit on obviously malformed input before hitting the DB.
 */
export const passwordResetValidator = vine.compile(
    vine.object({
        token: vine.string().regex(/^[a-f0-9]{64}$/),
        password: passwordRule,
    }),
);
