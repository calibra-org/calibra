import type { HttpContext } from "@adonisjs/core/http";
import vine from "@vinejs/vine";

import { withTenantTransaction } from "#services/tenant_context";

/** Authed in-session password change. Reuses the same strength rule as the reset flow. */
const passwordChangeValidator = vine.compile(
    vine.object({
        password: vine
            .string()
            .minLength(8)
            .maxLength(128)
            .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/),
    }),
);

export default class PasswordChangeController {
    /**
     * POST /api/v1/auth/password/change — the authenticated operator sets a new password and clears
     * the forced-change flag in one transaction (the model's `beforeSave` hashes it). This is the
     * route the 423 `E_PASSWORD_CHANGE_REQUIRED` gate steers a freshly-provisioned operator to; it is
     * deliberately NOT an admin route, so it stays reachable while every admin route is gated.
     */
    async handle(ctx: HttpContext) {
        const { password } = await ctx.request.validateUsing(passwordChangeValidator);
        const user = ctx.auth.getUserOrFail();

        await withTenantTransaction(async (trx) => {
            user.useTransaction(trx);
            user.passwordHash = password;
            user.mustChangePassword = false;
            await user.save();
        });

        return { message: "Password changed." };
    }
}
