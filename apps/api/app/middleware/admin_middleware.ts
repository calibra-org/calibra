import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";

/**
 * Gatekeeper for admin-only routes. Always mounted after `auth`, so `ctx.auth.user` is guaranteed
 * to be resolved; the only thing this middleware decides is the role check. Non-admin callers get
 * a localized 403 — never a 401 — so the storefront knows the token is valid but insufficient.
 */
export default class AdminMiddleware {
    async handle(ctx: HttpContext, next: NextFn) {
        const user = ctx.auth.getUserOrFail();
        if (user.role !== "admin") {
            throw new Exception(ctx.i18n.t("errors.auth.forbidden_admin", {}, "Admin access required"), {
                status: 403,
                code: "E_FORBIDDEN_ADMIN",
            });
        }
        return next();
    }
}
