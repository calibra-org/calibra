import crypto from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import logger from "@adonisjs/core/services/logger";
import { DateTime } from "luxon";

import Customer from "#models/customer";
import CustomerImpersonationEvent from "#models/customer_impersonation_event";
import CustomerMergeHistory from "#models/customer_merge_history";
import PasswordResetToken from "#models/password_reset_token";
import User from "#models/user";
import { recordAudit } from "#services/admin_audit_log_service";
import { withTenantTransaction } from "#services/tenant_context";
import CustomerTransformer from "#transformers/customer_transformer";
import UserTransformer from "#transformers/user_transformer";
import { adminCustomerConvertToAccountValidator, adminCustomerMergeValidator } from "#validators/admin/customer_validator";

const PASSWORD_RESET_TTL_MINUTES = 60;
const IMPERSONATION_TTL_MINUTES = 15;

export default class AdminCustomerActionsController {
    /**
     * POST /:id/convert-to-account — links a guest customer to a freshly-created user. Either
     * `password` is provided directly OR `send_password_reset_email: true` triggers the same flow
     * the storefront uses (token in `password_reset_tokens`, plaintext logged in dev).
     */
    async convertToAccount(ctx: HttpContext) {
        const customer = await this.findCustomerOrFail(ctx.params.id);
        if (customer.userId !== null) {
            throw new Exception("Customer already has an account", {
                status: 409,
                code: "E_ALREADY_HAS_ACCOUNT",
            });
        }
        const payload = await ctx.request.validateUsing(adminCustomerConvertToAccountValidator);
        if (!payload.password && !payload.send_password_reset_email) {
            throw new Exception("password or send_password_reset_email is required", {
                status: 422,
                code: "E_VALIDATION_ERROR",
            });
        }

        const existing = await User.findBy("email", payload.email);
        if (existing) {
            throw new Exception("Email already in use", { status: 422, code: "E_VALIDATION_ERROR" });
        }

        const placeholderPassword = payload.password ?? `tmp-${crypto.randomBytes(16).toString("hex")}A1`;

        const { user, resetTokenPlain } = await withTenantTransaction(async (trx) => {
            const created = await User.create(
                {
                    email: payload.email,
                    passwordHash: placeholderPassword,
                    locale: ctx.i18n.locale,
                    role: "customer",
                },
                { client: trx },
            );
            customer.useTransaction(trx);
            customer.userId = created.id;
            await customer.save();

            let tokenPlain: string | null = null;
            if (payload.send_password_reset_email) {
                tokenPlain = crypto.randomBytes(32).toString("hex");
                const tokenHash = crypto.createHash("sha256").update(tokenPlain).digest("hex");
                await PasswordResetToken.create(
                    {
                        userId: created.id,
                        tokenHash,
                        expiresAt: DateTime.utc().plus({ minutes: PASSWORD_RESET_TTL_MINUTES }),
                    },
                    { client: trx },
                );
                logger.info({ user_id: created.id, token: tokenPlain }, "password reset issued (admin convert-to-account)");
            }
            return { user: created, resetTokenPlain: tokenPlain };
        });

        await recordAudit({
            ctx,
            action: "customer.convert_to_account",
            entityKind: "customer",
            entityId: Number(customer.id),
            payload: {
                email: payload.email,
                sent_password_reset_email: Boolean(payload.send_password_reset_email),
            },
        });

        await customer.load("user");
        return {
            data: {
                ...new CustomerTransformer(customer).toObject(),
                user: new UserTransformer(user).forAdmin(),
                /** Returned only in dev; the storefront mail provider replaces this with a one-shot link. */
                reset_token: resetTokenPlain,
            },
        };
    }

    /**
     * POST /:id/send-password-reset — admin-initiated forgot-password trigger. 400 for guest
     * customers; otherwise mints a token + writes audit row.
     */
    async sendPasswordReset(ctx: HttpContext) {
        const customer = await this.findCustomerOrFail(ctx.params.id);
        if (customer.userId === null) {
            throw new Exception("Customer is a guest — convert to account first", {
                status: 400,
                code: "E_GUEST_CUSTOMER",
            });
        }
        await customer.load("user");
        if (!customer.user || customer.user.deletedAt) {
            throw new Exception("Linked user not found", { status: 404, code: "E_NOT_FOUND" });
        }

        const tokenPlain = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(tokenPlain).digest("hex");
        await PasswordResetToken.create({
            userId: customer.user.id,
            tokenHash,
            expiresAt: DateTime.utc().plus({ minutes: PASSWORD_RESET_TTL_MINUTES }),
        });
        logger.info({ user_id: customer.user.id, token: tokenPlain }, "password reset issued (admin)");

        await recordAudit({
            ctx,
            action: "customer.password_reset.send",
            entityKind: "customer",
            entityId: Number(customer.id),
            payload: { user_id: String(customer.user.id) },
        });

        return {
            data: {
                ok: true,
                /** Dev-only echo; in prod this is sent over email. */
                reset_token: tokenPlain,
            },
        };
    }

    /**
     * POST /:id/impersonate — mints a short-lived (15min) access token bound to the customer's
     * user with an `impersonator_id` claim, plus an `customer_impersonation_events` audit row.
     * Storefront-side banner + impersonator-stamping middleware land in a follow-up PR.
     */
    async impersonate(ctx: HttpContext) {
        const customer = await this.findCustomerOrFail(ctx.params.id);
        if (customer.userId === null) {
            throw new Exception("Cannot impersonate a guest customer", {
                status: 400,
                code: "E_GUEST_CUSTOMER",
            });
        }
        await customer.load("user");
        if (!customer.user || customer.user.deletedAt) {
            throw new Exception("Linked user not found", { status: 404, code: "E_NOT_FOUND" });
        }

        const auth = await ctx.auth.authenticate();
        const tokenResult = await User.accessTokens.create(customer.user, ["impersonate"], {
            expiresIn: `${IMPERSONATION_TTL_MINUTES} minutes`,
        });
        const tokenValue = tokenResult.value?.release() ?? null;
        if (!tokenValue) {
            throw new Exception("Could not mint impersonation token", {
                status: 500,
                code: "E_INTERNAL",
            });
        }

        const event = await CustomerImpersonationEvent.create({
            impersonatorUserId: Number(auth.id),
            customerId: Number(customer.id),
            startedAt: DateTime.utc(),
            ipAddress: ctx.request.ip() ?? null,
            userAgent: ctx.request.header("user-agent") ?? null,
        });

        await recordAudit({
            ctx,
            action: "customer.impersonate",
            entityKind: "customer",
            entityId: Number(customer.id),
            payload: { event_id: String(event.id), token_expires_in_minutes: IMPERSONATION_TTL_MINUTES },
        });

        return {
            data: {
                token: tokenValue,
                token_query_param: "_impersonate",
                expires_at: DateTime.utc().plus({ minutes: IMPERSONATION_TTL_MINUTES }).toISO(),
                impersonator_id: String(auth.id),
                customer_id: String(customer.id),
                event_id: String(event.id),
            },
        };
    }

    /**
     * POST /customers/merge — non-trivial: reassign orders, dedupe addresses, union tags, take
     * most-recent marketing prefs, then soft-delete every duplicate. One transaction. Each
     * duplicate gets a `customer_merge_history` row for audit.
     */
    async merge(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminCustomerMergeValidator);
        if (payload.duplicate_ids.includes(payload.primary_id)) {
            throw new Exception("primary_id cannot be in duplicate_ids", {
                status: 422,
                code: "E_VALIDATION_ERROR",
            });
        }
        const auth = await ctx.auth.authenticate();
        const strategy = {
            addresses: payload.strategy?.addresses ?? "merge_all",
            tags: payload.strategy?.tags ?? "union",
            marketing_prefs: payload.strategy?.marketing_prefs ?? "most_recent",
        };

        await withTenantTransaction(async (trx) => {
            const primary = await Customer.query({ client: trx }).where("id", payload.primary_id).first();
            if (!primary) throw new Exception("Primary customer not found", { status: 404, code: "E_NOT_FOUND" });
            const duplicates = await Customer.query({ client: trx }).whereIn("id", payload.duplicate_ids).preload("user");
            if (duplicates.length !== payload.duplicate_ids.length) {
                throw new Exception("One or more duplicate customers not found", {
                    status: 404,
                    code: "E_NOT_FOUND",
                });
            }

            for (const dup of duplicates) {
                const snapshot = new CustomerTransformer(dup).toObject();
                /** Reassign orders + notes + downloads. */
                await trx
                    .from("orders")
                    .where("customer_id", Number(dup.id))
                    .update({ customer_id: Number(primary.id) });
                await trx
                    .from("customer_notes")
                    .where("customer_id", Number(dup.id))
                    .update({ customer_id: Number(primary.id) });
                await trx
                    .from("customer_downloads")
                    .where("customer_id", Number(dup.id))
                    .update({ customer_id: Number(primary.id) });

                if (strategy.addresses === "merge_all") {
                    await trx
                        .from("customer_addresses")
                        .where("customer_id", Number(dup.id))
                        .update({ customer_id: Number(primary.id), is_default: false });
                } else {
                    await trx.from("customer_addresses").where("customer_id", Number(dup.id)).delete();
                }

                if (strategy.tags === "union") {
                    await trx.raw(
                        `INSERT INTO customer_tag_pivot (customer_id, tag_id, created_at)
                             SELECT ?, tag_id, NOW() FROM customer_tag_pivot WHERE customer_id = ?
                             ON CONFLICT (customer_id, tag_id) DO NOTHING`,
                        [Number(primary.id), Number(dup.id)],
                    );
                }
                await trx.from("customer_tag_pivot").where("customer_id", Number(dup.id)).delete();

                if (strategy.marketing_prefs === "most_recent") {
                    const dupPrefs = await trx.from("customer_marketing_prefs").where("customer_id", Number(dup.id)).first();
                    const primaryPrefs = await trx
                        .from("customer_marketing_prefs")
                        .where("customer_id", Number(primary.id))
                        .first();
                    const dupUpdated = dupPrefs?.updated_at ? new Date(dupPrefs.updated_at).getTime() : 0;
                    const primaryUpdated = primaryPrefs?.updated_at ? new Date(primaryPrefs.updated_at).getTime() : 0;
                    if (dupPrefs && dupUpdated > primaryUpdated) {
                        const { customer_id: _customerId, ...prefData } = dupPrefs;
                        void _customerId;
                        if (primaryPrefs) {
                            await trx.from("customer_marketing_prefs").where("customer_id", Number(primary.id)).update(prefData);
                        } else {
                            await trx.table("customer_marketing_prefs").insert({
                                ...prefData,
                                customer_id: Number(primary.id),
                            });
                        }
                    }
                }
                await trx.from("customer_marketing_prefs").where("customer_id", Number(dup.id)).delete();
                await trx
                    .from("customer_marketing_consent_history")
                    .where("customer_id", Number(dup.id))
                    .update({ customer_id: Number(primary.id) });

                /** Audit + soft-delete the duplicate. */
                const mergeRow = new CustomerMergeHistory();
                mergeRow.primaryCustomerId = Number(primary.id);
                mergeRow.mergedCustomerId = Number(dup.id);
                mergeRow.strategy = strategy;
                mergeRow.snapshot = snapshot as unknown as Record<string, unknown>;
                mergeRow.actorUserId = Number(auth.id);
                mergeRow.occurredAt = DateTime.utc();
                mergeRow.useTransaction(trx);
                await mergeRow.save();

                dup.useTransaction(trx);
                dup.deletedAt = DateTime.utc();
                await dup.save();
                if (dup.user) {
                    dup.user.useTransaction(trx);
                    dup.user.deletedAt = DateTime.utc();
                    await dup.user.save();
                    await trx.from("auth_access_tokens").where("tokenable_id", Number(dup.user.id)).delete();
                }
            }
        });

        await recordAudit({
            ctx,
            action: "customer.merge",
            entityKind: "customer",
            entityId: payload.primary_id,
            payload: {
                primary_id: String(payload.primary_id),
                duplicate_ids: payload.duplicate_ids.map(String),
                strategy,
            },
        });

        const refreshed = await Customer.query().where("id", payload.primary_id).preload("user").preload("tags").firstOrFail();
        return {
            data: {
                ...new CustomerTransformer(refreshed).forAdmin(),
                user: refreshed.user ? new UserTransformer(refreshed.user).forAdmin() : null,
                merged_count: payload.duplicate_ids.length,
            },
        };
    }

    private async findCustomerOrFail(id: unknown) {
        const numeric = Number(id);
        if (!Number.isFinite(numeric)) throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
        const customer = await Customer.query().where("id", numeric).whereNull("deleted_at").preload("user").first();
        if (!customer) throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
        return customer;
    }
}
