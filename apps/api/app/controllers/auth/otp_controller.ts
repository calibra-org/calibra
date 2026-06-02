import { randomUUID } from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";
import hash from "@adonisjs/core/services/hash";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import User from "#models/user";
import { recordAuthEvent } from "#services/metrics/domain_metrics";
import { otpService } from "#services/otp_service";
import { currentTenantId } from "#services/tenant_context";
import UserTransformer from "#transformers/user_transformer";
import { otpRequestValidator, otpVerifyValidator } from "#validators/auth/otp_validator";

/**
 * Phone/email OTP — the primary storefront auth flow, tenant-scoped via the request context. The
 * same phone at two different shops resolves to two distinct `users` rows (per-tenant uniqueness).
 */
export default class OtpController {
    /**
     * POST /api/v1/auth/otp/request — issues a code. Always returns 200, even for an unknown
     * identifier, so the endpoint can't be used to enumerate registered phones/emails.
     */
    async request(ctx: HttpContext) {
        const { identifier, channel } = await ctx.request.validateUsing(otpRequestValidator);
        const { expiresIn } = await otpService.request(identifier, channel, "login");
        return { data: { expires_in: expiresIn } };
    }

    /**
     * POST /api/v1/auth/otp/verify — on a valid code, find-or-create the shopper within the current
     * tenant and mint a bearer token. OTP-only users get a random unguessable password hash (the
     * column is NOT NULL); they can later set a password via the reset flow.
     */
    async verify(ctx: HttpContext) {
        const { identifier, code } = await ctx.request.validateUsing(otpVerifyValidator);

        const ok = await otpService.verify(identifier, code, "login");
        if (!ok) {
            recordAuthEvent("login_fail");
            return ctx.response.status(422).send({
                errors: [
                    { message: ctx.i18n.t("errors.auth.invalid_otp", {}, "Invalid or expired code"), code: "E_INVALID_OTP" },
                ],
            });
        }

        const isEmail = identifier.includes("@");
        const column = isEmail ? "email" : "phone";
        const value = isEmail ? identifier.toLowerCase() : identifier;
        const tenantId = Number(currentTenantId());

        /**
         * Existing user lookup rides the request transaction (RLS-scoped to this tenant). The
         * explicit `tenant_id` predicate is belt-and-suspenders: it keeps the lookup correct even
         * where RLS is not enforced (e.g. a superuser connection), so the same phone at two tenants
         * resolves to two distinct users rather than leaking across the boundary.
         */
        let user = (await User.query().where(column, value).where("tenant_id", tenantId).first()) as User | null;

        if (user?.deletedAt) {
            recordAuthEvent("login_locked");
            return ctx.response.status(401).send({ errors: [{ message: "Account unavailable", code: "E_ACCOUNT_LOCKED" }] });
        }

        if (!user) {
            /**
             * Create new shoppers on the admin connection (committed immediately, explicit
             * tenant_id) rather than inside the request transaction: the access-token provider runs
             * on a separate connection and its FK to users(id) would not see a user still pending in
             * the uncommitted request transaction. OTP users get a random unguessable password hash
             * (column is NOT NULL) and can set a real one via the reset flow later.
             */
            const passwordHash = await hash.make(randomUUID());
            const now = DateTime.utc().toSQL()!;
            const inserted = await db
                .connection("postgres_admin")
                .table("users")
                .insert({
                    tenant_id: tenantId,
                    email: isEmail ? value : null,
                    phone: isEmail ? null : value,
                    password_hash: passwordHash,
                    role: "customer",
                    locale: ctx.i18n.locale ?? "fa",
                    last_login_at: now,
                    created_at: now,
                    updated_at: now,
                })
                .returning(["id"]);
            user = (await User.query({ client: db.connection("postgres_admin") })
                .where("id", Number(inserted[0].id))
                .firstOrFail()) as User;
        } else {
            user.lastLoginAt = DateTime.utc();
            await user.save();
        }

        const token = await User.accessTokens.create(user);
        recordAuthEvent("login_success");

        return {
            data: {
                user: new UserTransformer(user).toObject(),
                token: {
                    type: "bearer",
                    value: token.value!.release(),
                    expires_at: token.expiresAt?.toISOString() ?? null,
                },
            },
        };
    }
}
