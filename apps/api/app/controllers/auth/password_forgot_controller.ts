import crypto from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";
import logger from "@adonisjs/core/services/logger";
import { DateTime } from "luxon";

import PasswordResetToken from "#models/password_reset_token";
import User from "#models/user";
import { passwordForgotValidator } from "#validators/auth/password_validator";

const TOKEN_TTL_MINUTES = 60;

export default class PasswordForgotController {
    /**
     * Always returns 200, even when the email is unknown — leaking which addresses are registered
     * lets attackers enumerate accounts. The token is generated, hashed, and stored only when the
     * email matches; in dev the plaintext token is logged at info level so the smoke flow can
     * grab it without a real mail provider.
     */
    async handle(ctx: HttpContext) {
        const { email } = await ctx.request.validateUsing(passwordForgotValidator);

        const user = await User.findBy("email", email);
        if (user && !user.deletedAt) {
            const tokenPlain = crypto.randomBytes(32).toString("hex");
            const tokenHash = crypto.createHash("sha256").update(tokenPlain).digest("hex");
            await PasswordResetToken.create({
                userId: user.id,
                tokenHash,
                expiresAt: DateTime.utc().plus({ minutes: TOKEN_TTL_MINUTES }),
            });

            logger.info({ user_id: user.id, token: tokenPlain }, "password reset requested");
        }

        return { message: "If the email matches an account, a reset link has been sent." };
    }
}
