import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import User from "#models/user";

/**
 * POST /api/v1/auth/impersonation/stop — ends the current impersonated session: closes the audit
 * event (`ended_at`) and revokes the short-lived token. Called by the admin panel's "exit
 * impersonation" banner (the impersonated shop-admin is the authenticated user here, `api` guard).
 */
export default class ImpersonationStopController {
    async handle(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        const token = user.currentAccessToken;

        await db
            .connection("postgres_admin")
            .from("tenant_impersonation_events")
            .where("target_user_id", Number(user.id))
            .whereNull("ended_at")
            .update({ ended_at: DateTime.utc().toSQL()! });

        if (token) {
            await User.accessTokens.delete(user, token.identifier);
        }

        return { data: { ended: true } };
    }
}
