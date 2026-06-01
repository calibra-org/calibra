import type { HttpContext } from "@adonisjs/core/http";
import { DateTime } from "luxon";

import PlatformUser from "#models/platform_user";
import { loginValidator } from "#validators/auth/login_validator";

/**
 * POST /api/v1/platform/auth/login — email + password login for control-plane operators. Mints a
 * `pat_`-prefixed token on the `platform` guard. Global route (no tenant context).
 */
export default class PlatformLoginController {
    async handle(ctx: HttpContext) {
        const { email, password } = await ctx.request.validateUsing(loginValidator);

        const user = await PlatformUser.verifyCredentials(email, password);
        if (user.deletedAt) {
            return ctx.response.status(401).send({ errors: [{ message: "Invalid credentials" }] });
        }

        user.lastLoginAt = DateTime.utc();
        await user.save();

        const token = await PlatformUser.accessTokens.create(user);

        return {
            data: {
                platform_user: { id: Number(user.id), email: user.email, name: user.name, role: user.role },
                token: {
                    type: "bearer",
                    value: token.value!.release(),
                    expires_at: token.expiresAt?.toISOString() ?? null,
                },
            },
        };
    }
}
