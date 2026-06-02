import crypto from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import { DateTime } from "luxon";

import PasswordResetToken from "#models/password_reset_token";
import User from "#models/user";
import { withTenantTransaction } from "#services/tenant_context";
import { passwordResetValidator } from "#validators/auth/password_validator";

export default class PasswordResetController {
    /**
     * Reset flow: hash the submitted token, look it up, check it hasn't been used/expired, then in
     * one transaction set the new password (the User model's beforeSave hook hashes it) and
     * invalidate every access token for that user — a password reset always logs out other
     * sessions.
     */
    async handle(ctx: HttpContext) {
        const { token, password } = await ctx.request.validateUsing(passwordResetValidator);

        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const row = await PasswordResetToken.findBy("tokenHash", tokenHash);

        if (!row || row.usedAt || row.expiresAt < DateTime.utc()) {
            throw new Exception("Reset token is invalid or expired", {
                status: 422,
                code: "E_INVALID_RESET_TOKEN",
            });
        }

        await withTenantTransaction(async (trx) => {
            const user = await User.findOrFail(row.userId, { client: trx });
            user.passwordHash = password;
            await user.save();

            row.usedAt = DateTime.utc();
            row.useTransaction(trx);
            await row.save();

            /**
             * Wipe every token issued to this user. The reset itself is the implicit "log out
             * everywhere" signal — without this, an attacker who held a stolen token before the
             * reset would still have an active session.
             */
            await trx.from("auth_access_tokens").where("tokenable_id", Number(user.id)).delete();
        });

        return { message: "Password has been reset." };
    }
}
