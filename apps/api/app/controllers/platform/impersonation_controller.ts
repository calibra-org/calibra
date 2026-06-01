import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import User from "#models/user";

/**
 * Platform → shop-staff impersonation ("log in as"). Guarded by the `platform` guard. Mints a
 * short-lived token for the tenant's shop admin carrying an `impersonated_by:<platformUserId>`
 * ability so `/auth/me` can render a persistent banner, and records an audit row. Platform routes
 * are global, so the target user is looked up on the admin connection (no tenant RLS context here).
 */
export default class ImpersonationController {
    async start(ctx: HttpContext) {
        const operator = ctx.platformUser;
        if (!operator) {
            return ctx.response.status(401).send({ errors: [{ message: "Unauthorized", code: "E_UNAUTHORIZED" }] });
        }
        const tenantId = ctx.params.id;

        const tenant = await db.connection("postgres_admin").from("tenants").where("id", tenantId).first();
        if (!tenant) {
            return ctx.response.status(404).send({ errors: [{ message: "Tenant not found", code: "E_TENANT_NOT_FOUND" }] });
        }

        const targetId = ctx.request.input("target_user_id");
        const reason = ctx.request.input("reason") ?? null;

        const query = User.query({ client: db.connection("postgres_admin") })
            .where("tenant_id", tenantId)
            .where("role", "admin")
            .whereNull("deleted_at");
        if (targetId) {
            query.where("id", targetId);
        }
        const target = (await query.orderBy("id", "asc").first()) as User | null;
        if (!target) {
            return ctx.response
                .status(404)
                .send({ errors: [{ message: "No shop admin to impersonate", code: "E_NO_TARGET" }] });
        }

        const token = await User.accessTokens.create(target, [`impersonated_by:${operator.id}`], { expiresIn: "30 mins" });

        await db
            .connection("postgres_admin")
            .table("tenant_impersonation_events")
            .insert({
                platform_user_id: Number(operator.id),
                tenant_id: Number(tenantId),
                target_user_id: Number(target.id),
                reason,
                ip_address: ctx.request.ip(),
                started_at: DateTime.utc().toSQL()!,
            });

        return {
            data: {
                token: {
                    type: "bearer",
                    value: token.value!.release(),
                    expires_at: token.expiresAt?.toISOString() ?? null,
                },
                admin_url: `https://${tenant.slug}.admin.calibra.app`,
            },
        };
    }
}
