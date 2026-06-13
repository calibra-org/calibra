import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import User from "#models/user";
import { currentImpersonatorId } from "#services/impersonation";

/**
 * POST /api/v1/auth/impersonation/stop — ends the CURRENT impersonated session: closes only this
 * operator's open event (scoped by `platform_user_id` from the token's `impersonated_by` ability, so
 * two operators on the same admin don't co-close each other's events) with `end_cause='manual'`, and
 * revokes the short-lived token. The impersonated shop-admin is the authenticated user (`api` guard).
 */
export default class ImpersonationStopController {
    async handle(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        const token = user.currentAccessToken;
        const impersonatorId = currentImpersonatorId(ctx);

        if (impersonatorId !== null) {
            await db
                .connection("postgres_admin")
                .from("tenant_impersonation_events")
                .where("target_user_id", Number(user.id))
                .where("platform_user_id", Number(impersonatorId))
                .whereNull("ended_at")
                .update({ ended_at: DateTime.utc().toSQL()!, end_cause: "manual" });
        }

        if (token) {
            await User.accessTokens.delete(user, token.identifier);
        }

        return { data: { ended: true } };
    }
}
