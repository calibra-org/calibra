import { randomUUID } from "node:crypto";

import type { HttpContext } from "@adonisjs/core/http";
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
                errors: [{ message: ctx.i18n.t("errors.auth.invalid_otp", {}, "Invalid or expired code"), code: "E_INVALID_OTP" }],
            });
        }

        const isEmail = identifier.includes("@");
        const column = isEmail ? "email" : "phone";
        const value = isEmail ? identifier.toLowerCase() : identifier;

        let user = (await User.query().where(column, value).first()) as User | null;
        if (!user) {
            user = new User();
            user.tenantId = Number(currentTenantId());
            if (isEmail) {
                user.email = value;
            } else {
                user.phone = value;
            }
            user.role = "customer";
            user.locale = ctx.i18n.locale ?? "fa";
            user.passwordHash = randomUUID();
            await user.save();
        } else if (user.deletedAt) {
            recordAuthEvent("login_locked");
            return ctx.response.status(401).send({ errors: [{ message: "Account unavailable", code: "E_ACCOUNT_LOCKED" }] });
        }

        user.lastLoginAt = DateTime.utc();
        await user.save();

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
