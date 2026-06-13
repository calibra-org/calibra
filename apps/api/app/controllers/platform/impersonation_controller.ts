import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import vine from "@vinejs/vine";
import { DateTime } from "luxon";

import User from "#models/user";
import { adminBaseForSlug } from "#services/handoff_service";

/** Targeted impersonation requires both a chosen operator and an operator-supplied reason. */
const impersonateValidator = vine.compile(
    vine.object({
        target_user_id: vine.number().positive(),
        reason: vine.string().trim().minLength(3).maxLength(500),
    }),
);

/**
 * Platform → shop-staff impersonation ("log in as"). Guarded by the `platform` guard. Mints a
 * 30-minute token for the **chosen** tenant admin carrying ONLY the `impersonated_by:<platformUserId>`
 * ability (no platform abilities — RLS scopes it to the target's tenant by construction), records a
 * `tenant_impersonation_events` row (with the required reason + captured user agent), and returns the
 * admin URL derived from the tenant **slug** — never a custom domain, so an operator cookie is never
 * deposited on a customer-controlled host. Runs on the admin connection (no tenant RLS context).
 */
export default class ImpersonationController {
    async start(ctx: HttpContext) {
        const operator = ctx.platformUser;
        if (!operator) {
            return ctx.response.status(401).send({ errors: [{ message: "Unauthorized", code: "E_UNAUTHORIZED" }] });
        }
        const tenantId = ctx.params.id;
        const { target_user_id: targetUserId, reason } = await ctx.request.validateUsing(impersonateValidator);

        const tenant = await db.connection("postgres_admin").from("tenants").where("id", tenantId).first();
        if (!tenant) {
            return ctx.response.status(404).send({ errors: [{ message: "Tenant not found", code: "E_TENANT_NOT_FOUND" }] });
        }

        const target = (await User.query({ client: db.connection("postgres_admin") })
            .where("id", targetUserId)
            .where("tenant_id", tenantId)
            .where("role", "admin")
            .whereNull("deleted_at")
            .first()) as User | null;
        if (!target || target.disabledAt !== null) {
            return ctx.response
                .status(404)
                .send({ errors: [{ message: "No such active shop admin to impersonate", code: "E_NO_TARGET" }] });
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
                user_agent: ctx.request.header("user-agent") ?? null,
                started_at: DateTime.utc().toSQL()!,
            });

        return {
            data: {
                token: {
                    type: "bearer",
                    value: token.value!.release(),
                    expires_at: token.expiresAt?.toISOString() ?? null,
                },
                admin_url: adminBaseForSlug(String(tenant.slug)),
            },
        };
    }
}
