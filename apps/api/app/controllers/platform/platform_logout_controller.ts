import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import PlatformUser from "#models/platform_user";

/**
 * POST /api/v1/platform/auth/logout — revokes the operator's platform token AND every live
 * impersonation session they minted. An impersonation `oat_` outlives the operator's console session
 * otherwise; logging out must kill those too. Closes the matching open audit events
 * (`end_cause='revoked'`). Guarded by `platformAuth`.
 */
export default class PlatformLogoutController {
    async handle(ctx: HttpContext) {
        const operator = ctx.platformUser;
        if (!operator) {
            return ctx.response.status(401).send({ errors: [{ message: "Unauthorized", code: "E_UNAUTHORIZED" }] });
        }
        const operatorId = Number(operator.id);
        const conn = db.connection("postgres_admin");

        /** Revoke impersonation tokens minted by this operator (oat_ rows tagged with the ability). */
        await conn
            .from("auth_access_tokens")
            .whereRaw("abilities::text LIKE ?", [`%"impersonated_by:${operatorId}"%`])
            .delete();
        await conn
            .from("tenant_impersonation_events")
            .where("platform_user_id", operatorId)
            .whereNull("ended_at")
            .update({ ended_at: DateTime.utc().toSQL()!, end_cause: "revoked" });

        const token = operator.currentAccessToken;
        if (token) {
            await PlatformUser.accessTokens.delete(operator, token.identifier);
        }

        return { data: { ended: true } };
    }
}
