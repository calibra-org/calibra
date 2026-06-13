import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";

import { currentImpersonatorId } from "#services/impersonation";
import { maybeTenantId } from "#services/tenant_context";

/**
 * Gatekeeper for admin-only routes. Always mounted after `auth`, so `ctx.auth.user` is guaranteed
 * to be resolved; this middleware decides two things: the role check, and (defense in depth on top
 * of RLS) that the authenticated user belongs to the tenant the request was scoped to.
 *
 * Non-admin callers get a localized 403 — never a 401 — so the caller knows the token is valid but
 * insufficient. A token whose user belongs to a *different* tenant than the one resolved from
 * `X-Calibra-Tenant` / `Host` (`tenant_context_middleware`) is rejected with `E_TENANT_MISMATCH`:
 * RLS already scopes every row read to `app.current_tenant`, so such a session would see an empty
 * shop — but failing loud here stops a staff member from poking another shop's admin by swapping the
 * host, and surfaces the mismatch to the BFF so it can force a re-login (Phase 4 RULE B).
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

        /**
         * `tenant_context_middleware` runs server-level (before the router), so a tenant is normally
         * resolved by the time an admin route executes. When it is, the token's user must belong to
         * it. A null context (no `X-Calibra-Tenant`, no resolvable `Host`) is left to RLS to fail
         * closed — there is no tenant to mismatch against.
         */
        const tenantId = maybeTenantId();
        if (tenantId !== null && BigInt(user.tenantId) !== tenantId) {
            throw new Exception(ctx.i18n.t("errors.auth.tenant_mismatch", {}, "Account does not belong to this shop"), {
                status: 403,
                code: "E_TENANT_MISMATCH",
            });
        }

        /**
         * Forced password change. An operator holding a freshly-minted / rotated / handed-off
         * credential must set a new password before touching any admin route — the column read is the
         * floor, so even a raw `curl` with the pre-change token 423s here. The gate is bypassed during
         * impersonation (the operator must not be blocked by the *target's* pending change), detected
         * via the token's `impersonated_by` ability. `/auth/password/change` and the handoff
         * `/auth/password/reset` consume path are NOT admin routes, so they stay reachable to clear it.
         */
        if (user.mustChangePassword && currentImpersonatorId(ctx) === null) {
            throw new Exception(ctx.i18n.t("errors.auth.password_change_required", {}, "Password change required"), {
                status: 423,
                code: "E_PASSWORD_CHANGE_REQUIRED",
            });
        }

        return next();
    }
}
