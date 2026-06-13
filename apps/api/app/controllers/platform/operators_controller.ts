import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import vine from "@vinejs/vine";
import { DateTime } from "luxon";

import Tenant from "#models/tenant";
import User from "#models/user";
import { computeOperatorCapabilities } from "#policies/operator_capabilities";
import { CredentialService } from "#services/credential_service";
import { createOperatorHandoffLink } from "#services/handoff_service";
import { recordPlatformAudit } from "#services/platform_audit_service";
import { runWithTenant } from "#services/tenant_context";
import { toOperator } from "#transformers/operator_transformer";

function admin() {
    return db.connection("postgres_admin");
}

const createOperatorValidator = vine.compile(
    vine.object({
        email: vine.string().trim().email().maxLength(254),
        /** When true, return a single-use handoff link instead of a revealed temp password. */
        handoff: vine.boolean().optional(),
    }),
);

/** Revoke a tenant user's `oat_` sessions. Scoped by `tokenable_id` so `pat_` platform tokens (a
 * different table entirely) are never touched. */
async function revokeUserTokens(trx: TransactionClientContract, userId: number): Promise<void> {
    await trx.from("auth_access_tokens").where("tokenable_id", userId).delete();
}

/** Non-deleted, non-disabled admin count for a tenant — gates last-admin protection. */
async function activeAdminCount(tenantId: number): Promise<number> {
    const row = await admin()
        .from("users")
        .where("tenant_id", tenantId)
        .where("role", "admin")
        .whereNull("deleted_at")
        .whereNull("disabled_at")
        .count("* as total")
        .first();
    return Number(row?.total ?? 0);
}

/**
 * Control-plane operator management for a tenant. All reads/writes on the BYPASSRLS `postgres_admin`
 * connection with an explicit `tenant_id` filter on every query (RLS gives no protection here);
 * every mutation is wrapped in `admin().transaction()` with a paired `platform_audit_events` row.
 * Capabilities are computed for a platform caller and never trusted from the client.
 */
export default class PlatformOperatorsController {
    private async loadTenant(id: string | number): Promise<Tenant | null> {
        return Tenant.query({ client: admin() }).where("id", id).whereNull("deleted_at").first();
    }

    private operatorId(ctx: HttpContext): number | null {
        return ctx.platformUser ? Number(ctx.platformUser.id) : null;
    }

    /** List the tenant's operators (admins), including the store owner, with per-row capabilities. */
    async index(ctx: HttpContext) {
        const tenant = await this.loadTenant(ctx.params.id);
        if (!tenant) {
            return ctx.response.status(404).send({ errors: [{ message: "Tenant not found", code: "E_TENANT_NOT_FOUND" }] });
        }
        const tenantId = Number(tenant.id);
        const operators = await User.query({ client: admin() })
            .where("tenant_id", tenantId)
            .where("role", "admin")
            .whereNull("deleted_at")
            .orderBy("id", "asc");
        const count = await activeAdminCount(tenantId);

        const data = operators.map((op) =>
            toOperator(op, {
                isStoreOwner: Number(op.id) === Number(tenant.ownerUserId),
                capabilities: computeOperatorCapabilities({
                    callerKind: "platform",
                    operator: op,
                    ownerUserId: Number(tenant.ownerUserId),
                    activeAdminCount: count,
                }),
            }),
        );
        return { data };
    }

    /**
     * Create (or reactivate) an operator. The per-tenant citext unique does NOT exclude soft-deleted
     * rows, so a bare insert of a previously-removed email 500s — instead we reactivate: clear
     * `deleted_at`/`disabled_at` and rotate the credential. New rows go through `runWithTenant` so the
     * `tenant_id` stamp + per-tenant unique resolve. Reveals a temp password once, OR returns a
     * single-use handoff link (mutually exclusive).
     */
    async store(ctx: HttpContext) {
        const tenant = await this.loadTenant(ctx.params.id);
        if (!tenant) {
            return ctx.response.status(404).send({ errors: [{ message: "Tenant not found", code: "E_TENANT_NOT_FOUND" }] });
        }
        const { email, handoff } = await ctx.request.validateUsing(createOperatorValidator);
        const tenantId = Number(tenant.id);
        const normalizedEmail = email.toLowerCase();

        const existing = await User.query({ client: admin() })
            .where("tenant_id", tenantId)
            .where("email", normalizedEmail)
            .first();
        if (existing && existing.deletedAt === null && existing.disabledAt === null) {
            return ctx.response
                .status(409)
                .send({ errors: [{ message: "Operator already exists", code: "E_OPERATOR_EXISTS", field: "email" }] });
        }

        const tempPassword = CredentialService.generateTempPassword();
        let operatorId = 0;
        let handoffUrl: string | null = null;

        await admin().transaction(async (trx) => {
            await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenantId)]);
            operatorId = await runWithTenant(BigInt(tenantId), trx, async () => {
                const user = existing ?? new User();
                user.tenantId = tenantId;
                user.email = normalizedEmail;
                user.role = "admin";
                user.passwordHash = tempPassword;
                user.mustChangePassword = true;
                user.disabledAt = null;
                user.deletedAt = null;
                if (!user.locale) user.locale = "fa";
                user.useTransaction(trx);
                await user.save();
                return Number(user.id);
            });

            if (handoff) {
                const link = await createOperatorHandoffLink(trx, {
                    userId: operatorId,
                    tenantId,
                    slug: String(tenant.slug),
                    createdByPlatformUserId: this.operatorId(ctx),
                });
                handoffUrl = link.url;
            }

            await recordPlatformAudit(trx, {
                platformUserId: this.operatorId(ctx),
                tenantId,
                targetUserId: operatorId,
                action: "operator_created",
                metadata: { email: normalizedEmail, reactivated: Boolean(existing), via: handoff ? "handoff" : "temp_password" },
                ipAddress: ctx.request.ip(),
                userAgent: ctx.request.header("user-agent") ?? null,
            });
        });

        const fresh = await User.query({ client: admin() }).where("id", operatorId).firstOrFail();
        ctx.response.status(201);
        return {
            data: toOperator(fresh, {
                isStoreOwner: false,
                capabilities: computeOperatorCapabilities({
                    callerKind: "platform",
                    operator: fresh,
                    ownerUserId: Number(tenant.ownerUserId),
                    activeAdminCount: await activeAdminCount(tenantId),
                }),
            }),
            credentials: handoff
                ? { handoff_url: handoffUrl, temp_password: null }
                : { handoff_url: null, temp_password: tempPassword, must_change_password: true },
        };
    }

    /** Disable an operator: stamp `disabled_at`, revoke their `oat_` sessions. Owner + last-admin guarded. */
    async disable(ctx: HttpContext) {
        return this.guardedLifecycle(ctx, "disable");
    }

    /** Re-enable a disabled operator. */
    async enable(ctx: HttpContext) {
        const { tenant, target, error } = await this.loadTarget(ctx);
        if (error) return error;
        await admin().transaction(async (trx) => {
            await trx.from("users").where("id", Number(target.id)).where("tenant_id", Number(tenant.id)).update({
                disabled_at: null,
                updated_at: DateTime.utc().toSQL()!,
            });
            await recordPlatformAudit(trx, {
                platformUserId: this.operatorId(ctx),
                tenantId: Number(tenant.id),
                targetUserId: Number(target.id),
                action: "operator_enabled",
                ipAddress: ctx.request.ip(),
                userAgent: ctx.request.header("user-agent") ?? null,
            });
        });
        return this.respondOperator(ctx, tenant, Number(target.id));
    }

    /** Soft-delete an operator. Owner + last-admin guarded. */
    async destroy(ctx: HttpContext) {
        return this.guardedLifecycle(ctx, "remove");
    }

    /** Rotate the operator's password to a fresh temp password, force change, revoke sessions, reveal once. */
    async resetPassword(ctx: HttpContext) {
        const { tenant, target, error } = await this.loadTarget(ctx);
        if (error) return error;
        const tempPassword = CredentialService.generateTempPassword();
        await admin().transaction(async (trx) => {
            await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenant.id)]);
            await runWithTenant(BigInt(Number(tenant.id)), trx, async () => {
                target.passwordHash = tempPassword;
                target.mustChangePassword = true;
                target.useTransaction(trx);
                await target.save();
            });
            await revokeUserTokens(trx, Number(target.id));
            await recordPlatformAudit(trx, {
                platformUserId: this.operatorId(ctx),
                tenantId: Number(tenant.id),
                targetUserId: Number(target.id),
                action: "password_rotated",
                ipAddress: ctx.request.ip(),
                userAgent: ctx.request.header("user-agent") ?? null,
            });
        });
        return { data: { temp_password: tempPassword, must_change_password: true } };
    }

    /** Issue a single-use handoff link for the operator to set their own password. */
    async handoffLink(ctx: HttpContext) {
        const { tenant, target, error } = await this.loadTarget(ctx);
        if (error) return error;
        let url = "";
        let expiresAt = "";
        await admin().transaction(async (trx) => {
            const link = await createOperatorHandoffLink(trx, {
                userId: Number(target.id),
                tenantId: Number(tenant.id),
                slug: String(tenant.slug),
                createdByPlatformUserId: this.operatorId(ctx),
            });
            url = link.url;
            expiresAt = link.expires_at;
            await recordPlatformAudit(trx, {
                platformUserId: this.operatorId(ctx),
                tenantId: Number(tenant.id),
                targetUserId: Number(target.id),
                action: "handoff_link_issued",
                ipAddress: ctx.request.ip(),
                userAgent: ctx.request.header("user-agent") ?? null,
            });
        });
        return { data: { handoff_url: url, expires_at: expiresAt } };
    }

    /** Transfer shop ownership to the target (must be an active admin). Previous owner stays an admin. */
    async makeOwner(ctx: HttpContext) {
        const { tenant, target, error } = await this.loadTarget(ctx);
        if (error) return error;
        if (target.role !== "admin" || target.disabledAt !== null) {
            return ctx.response
                .status(422)
                .send({ errors: [{ message: "Target must be an active admin", code: "E_INVALID_OWNER" }] });
        }
        if (Number(target.id) === Number(tenant.ownerUserId)) {
            return ctx.response.status(422).send({ errors: [{ message: "Already the owner", code: "E_ALREADY_OWNER" }] });
        }
        await admin().transaction(async (trx) => {
            await trx
                .from("tenants")
                .where("id", Number(tenant.id))
                .update({
                    owner_user_id: Number(target.id),
                    updated_at: DateTime.utc().toSQL()!,
                });
            await recordPlatformAudit(trx, {
                platformUserId: this.operatorId(ctx),
                tenantId: Number(tenant.id),
                targetUserId: Number(target.id),
                action: "ownership_transferred",
                metadata: { previous_owner_user_id: Number(tenant.ownerUserId) },
                ipAddress: ctx.request.ip(),
                userAgent: ctx.request.header("user-agent") ?? null,
            });
        });
        return this.respondOperator(ctx, await this.loadTenant(ctx.params.id), Number(target.id));
    }

    /** Shared disable/remove path with owner + last-admin guards + token revocation + audit. */
    private async guardedLifecycle(ctx: HttpContext, kind: "disable" | "remove") {
        const { tenant, target, error } = await this.loadTarget(ctx);
        if (error) return error;
        if (Number(target.id) === Number(tenant.ownerUserId)) {
            return ctx.response
                .status(422)
                .send({ errors: [{ message: "Can't modify the store owner", code: "E_STORE_OWNER_PROTECTED" }] });
        }
        if ((await activeAdminCount(Number(tenant.id))) <= 1) {
            return ctx.response
                .status(422)
                .send({ errors: [{ message: "Can't remove the last active admin", code: "E_LAST_ADMIN" }] });
        }

        await admin().transaction(async (trx) => {
            const patch =
                kind === "disable"
                    ? { disabled_at: DateTime.utc().toSQL()!, updated_at: DateTime.utc().toSQL()! }
                    : { deleted_at: DateTime.utc().toSQL()!, updated_at: DateTime.utc().toSQL()! };
            await trx.from("users").where("id", Number(target.id)).where("tenant_id", Number(tenant.id)).update(patch);
            await revokeUserTokens(trx, Number(target.id));
            await recordPlatformAudit(trx, {
                platformUserId: this.operatorId(ctx),
                tenantId: Number(tenant.id),
                targetUserId: Number(target.id),
                action: kind === "disable" ? "operator_disabled" : "operator_removed",
                ipAddress: ctx.request.ip(),
                userAgent: ctx.request.header("user-agent") ?? null,
            });
        });

        if (kind === "remove") return { data: { removed: true } };
        return this.respondOperator(ctx, tenant, Number(target.id));
    }

    /** Load the tenant + the target admin user (scoped by tenant_id), or a ready error response. */
    private async loadTarget(ctx: HttpContext) {
        const tenant = await this.loadTenant(ctx.params.id);
        if (!tenant) {
            return {
                tenant: null as unknown as Tenant,
                target: null as unknown as User,
                error: ctx.response.status(404).send({ errors: [{ message: "Tenant not found", code: "E_TENANT_NOT_FOUND" }] }),
            };
        }
        const target = await User.query({ client: admin() })
            .where("id", ctx.params.userId)
            .where("tenant_id", Number(tenant.id))
            .where("role", "admin")
            .first();
        if (!target) {
            return {
                tenant,
                target: null as unknown as User,
                error: ctx.response
                    .status(404)
                    .send({ errors: [{ message: "Operator not found", code: "E_OPERATOR_NOT_FOUND" }] }),
            };
        }
        return { tenant, target, error: null };
    }

    /** Re-load + serialize a single operator with fresh capabilities. */
    private async respondOperator(ctx: HttpContext, tenant: Tenant | null, userId: number) {
        if (!tenant) {
            return ctx.response.status(404).send({ errors: [{ message: "Tenant not found", code: "E_TENANT_NOT_FOUND" }] });
        }
        const fresh = await User.query({ client: admin() }).where("id", userId).firstOrFail();
        return {
            data: toOperator(fresh, {
                isStoreOwner: Number(fresh.id) === Number(tenant.ownerUserId),
                capabilities: computeOperatorCapabilities({
                    callerKind: "platform",
                    operator: fresh,
                    ownerUserId: Number(tenant.ownerUserId),
                    activeAdminCount: await activeAdminCount(Number(tenant.id)),
                }),
            }),
        };
    }
}
