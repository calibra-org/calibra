import type { HttpContext } from "@adonisjs/core/http";

import User from "#models/user";

export default class LogoutController {
    /**
     * Revokes the bearer token used to authenticate this request. The guard already populated
     * `user.currentAccessToken` with the identifier, so a single delete is enough — no need to
     * re-derive it from the Authorization header.
     */
    async handle(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        const token = user.currentAccessToken;
        if (token) {
            await User.accessTokens.delete(user, token.identifier);
        }
        return { message: "logged out" };
    }
}
