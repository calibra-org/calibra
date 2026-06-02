import { Secret } from "@adonisjs/core/helpers";
import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";

import PlatformUser from "#models/platform_user";

/**
 * Authenticates control-plane (platform) requests against the `platform_access_tokens` table and
 * stashes the operator on `ctx.platformUser`. Implemented as a standalone middleware rather than a
 * second `@adonisjs/auth` guard on purpose: adding a guard to the default config widens
 * `ctx.auth.user` to a `User | PlatformUser` union across every existing controller. Keeping the
 * control-plane identity off `ctx.auth` preserves the tenant-side typing untouched.
 *
 * Platform routes are global — `tenant_context_middleware` skips `/api/v1/platform/*` — so there is
 * no tenant RLS context here; `platform_users` is a global table.
 */
export default class PlatformAuthMiddleware {
    async handle(ctx: HttpContext, next: NextFn) {
        const header = ctx.request.header("authorization") ?? "";
        const match = header.match(/^Bearer\s+(.+)$/i);
        if (!match) {
            return ctx.response.status(401).send({ errors: [{ message: "Unauthorized", code: "E_UNAUTHORIZED" }] });
        }

        const token = await PlatformUser.accessTokens.verify(new Secret(match[1]));
        if (!token) {
            return ctx.response.status(401).send({ errors: [{ message: "Unauthorized", code: "E_UNAUTHORIZED" }] });
        }

        const operator = await PlatformUser.find(token.tokenableId);
        if (!operator || operator.deletedAt) {
            return ctx.response.status(401).send({ errors: [{ message: "Unauthorized", code: "E_UNAUTHORIZED" }] });
        }

        operator.currentAccessToken = token;
        ctx.platformUser = operator;
        return next();
    }
}

declare module "@adonisjs/core/http" {
    interface HttpContext {
        platformUser?: PlatformUser;
    }
}
