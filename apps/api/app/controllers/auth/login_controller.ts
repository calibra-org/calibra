import type { HttpContext } from "@adonisjs/core/http";
import { DateTime } from "luxon";

import User from "#models/user";
import { recordAuthEvent } from "#services/metrics/domain_metrics";
import CustomerTransformer from "#transformers/customer_transformer";
import UserTransformer from "#transformers/user_transformer";
import { loginValidator } from "#validators/auth/login_validator";

export default class LoginController {
    /**
     * `User.verifyCredentials` runs the timing-attack-safe lookup + scrypt verify, throwing
     * `E_INVALID_CREDENTIALS` on either an unknown email or a bad password. Adonis turns that into
     * a 400 by default; the global handler can re-map to 401 if we want — for now we let the
     * framework default through so the message stays consistent.
     */
    async handle(ctx: HttpContext) {
        const { email, password } = await ctx.request.validateUsing(loginValidator);

        let user: User;
        try {
            user = await User.verifyCredentials(email, password);
        } catch (err) {
            recordAuthEvent("login_fail");
            throw err;
        }

        if (user.deletedAt) {
            recordAuthEvent("login_locked");
            return ctx.response.status(401).send({
                errors: [
                    {
                        message: ctx.i18n.t("errors.auth.invalid_credentials", {}, "Invalid credentials"),
                    },
                ],
            });
        }

        user.lastLoginAt = DateTime.utc();
        await user.save();
        await user.load("customer");

        const token = await User.accessTokens.create(user);
        recordAuthEvent("login_success");

        return {
            user: new UserTransformer(user).toObject(),
            customer: user.customer ? new CustomerTransformer(user.customer).toObject() : null,
            token: {
                type: "bearer",
                value: token.value!.release(),
                expires_at: token.expiresAt?.toISOString() ?? null,
            },
        };
    }
}
