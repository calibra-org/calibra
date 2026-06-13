import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import vine from "@vinejs/vine";
import { DateTime } from "luxon";

import Tenant from "#models/tenant";
import User from "#models/user";
import { computeOperatorCapabilities } from "#policies/operator_capabilities";
import { recordAudit } from "#services/admin_audit_log_service";
import { CredentialService } from "#services/credential_service";
import { createOperatorHandoffLink } from "#services/handoff_service";
import { assertNotImpersonating } from "#services/impersonation";
import { currentTenantId, currentTrx } from "#services/tenant_context";
import { toOperator } from "#transformers/operator_transformer";

const createOperatorValidator = vine.compile(
    vine.object({
        email: vine.string().trim().email().maxLength(254),
        handoff: vine.boolean().optional(),
    }),
);

/**
 * Tenant self-service operator management (Settings ▸ Team). Runs under tenant context (RLS, `api`
 * guard, `ctx.auth.user: User`). Mutations are owner-only — the caller must be the current
 * `store_owner` — and blocked during impersonation. Reads use the RLS-scoped `User` model;
 * mutations audit to `admin_audit_log` (the actor IS a tenant `users` row). Capabilities are computed
 * for an admin caller so non-owners get a read-only view.
 */
export default class AdminOperatorsController {
    private async currentTenant(): Promise<Tenant> {
        return Tenant.findOrFail(Number(currentTenantId()));
    }

    private async activeAdminCount(): Promise<number> {
        const row = await User.query()
            .where("role", "admin")
            .whereNull("deleted_at")
            .whereNull("disabled_at")
            .count("* as total")
            .first();
        return Number((row?.$extras as { total?: number })?.total ?? 0);
    }

    /** Require the caller be the shop owner for any mutation. */
    private assertOwner(ctx: HttpContext, tenant: Tenant): void {
        assertNotImpersonating();
        if (Number(ctx.auth.getUserOrFail().id) !== Number(tenant.ownerUserId)) {
            throw new Exception("Only the shop owner can manage operators", { status: 403, code: "E_NOT_STORE_OWNER" });
        }
    }

    async index(ctx: HttpContext) {
        const tenant = await this.currentTenant();
        const caller = ctx.auth.getUserOrFail();
        const operators = await User.query().where("role", "admin").whereNull("deleted_at").orderBy("id", "asc");
        const count = await this.activeAdminCount();
        const data = operators.map((op) =>
            toOperator(op, {
                isStoreOwner: Number(op.id) === Number(tenant.ownerUserId),
                capabilities: computeOperatorCapabilities({
                    callerKind: "admin",
                    callerUserId: Number(caller.id),
                    operator: op,
                    ownerUserId: Number(tenant.ownerUserId),
                    activeAdminCount: count,
                }),
            }),
        );
        return { data };
    }

    async store(ctx: HttpContext) {
        const tenant = await this.currentTenant();
        this.assertOwner(ctx, tenant);
        const { email, handoff } = await ctx.request.validateUsing(createOperatorValidator);
        const normalizedEmail = email.toLowerCase();

        const existing = await User.query().where("email", normalizedEmail).first();
        if (existing && existing.deletedAt === null && existing.disabledAt === null) {
            return ctx.response
                .status(409)
                .send({ errors: [{ message: "Operator already exists", code: "E_OPERATOR_EXISTS", field: "email" }] });
        }

        const tempPassword = CredentialService.generateTempPassword();
        const trx = currentTrx();
        const user = existing ?? new User();
        user.tenantId = Number(currentTenantId());
        user.email = normalizedEmail;
        user.role = "admin";
        user.passwordHash = tempPassword;
        user.mustChangePassword = true;
        user.disabledAt = null;
        user.deletedAt = null;
        if (!user.locale) user.locale = "fa";
        user.useTransaction(trx);
        await user.save();

        let handoffUrl: string | null = null;
        if (handoff) {
            const link = await createOperatorHandoffLink(trx, {
                userId: Number(user.id),
                tenantId: Number(tenant.id),
                slug: String(tenant.slug),
            });
            handoffUrl = link.url;
        }

        await recordAudit({
            ctx,
            action: "operator_created",
            entityKind: "user",
            entityId: Number(user.id),
            payload: { email: normalizedEmail, via: handoff ? "handoff" : "temp_password" },
            trx,
        });

        ctx.response.status(201);
        return {
            data: toOperator(user, {
                isStoreOwner: false,
                capabilities: computeOperatorCapabilities({
                    callerKind: "admin",
                    callerUserId: Number(ctx.auth.getUserOrFail().id),
                    operator: user,
                    ownerUserId: Number(tenant.ownerUserId),
                    activeAdminCount: await this.activeAdminCount(),
                }),
            }),
            credentials: handoff
                ? { handoff_url: handoffUrl, temp_password: null }
                : { handoff_url: null, temp_password: tempPassword, must_change_password: true },
        };
    }

    async disable(ctx: HttpContext) {
        return this.lifecycle(ctx, "disable");
    }

    async enable(ctx: HttpContext) {
        const { tenant, target, error } = await this.loadTarget(ctx);
        if (error) return error;
        this.assertOwner(ctx, tenant);
        const trx = currentTrx();
        target.disabledAt = null;
        target.useTransaction(trx);
        await target.save();
        await recordAudit({ ctx, action: "operator_enabled", entityKind: "user", entityId: Number(target.id), trx });
        return this.respond(ctx, tenant, target);
    }

    async destroy(ctx: HttpContext) {
        return this.lifecycle(ctx, "remove");
    }

    async resetPassword(ctx: HttpContext) {
        const { tenant, target, error } = await this.loadTarget(ctx);
        if (error) return error;
        this.assertOwner(ctx, tenant);
        const tempPassword = CredentialService.generateTempPassword();
        const trx = currentTrx();
        target.passwordHash = tempPassword;
        target.mustChangePassword = true;
        target.useTransaction(trx);
        await target.save();
        await trx.from("auth_access_tokens").where("tokenable_id", Number(target.id)).delete();
        await recordAudit({ ctx, action: "password_rotated", entityKind: "user", entityId: Number(target.id), trx });
        return { data: { temp_password: tempPassword, must_change_password: true } };
    }

    async handoffLink(ctx: HttpContext) {
        const { tenant, target, error } = await this.loadTarget(ctx);
        if (error) return error;
        this.assertOwner(ctx, tenant);
        const link = await createOperatorHandoffLink(currentTrx(), {
            userId: Number(target.id),
            tenantId: Number(tenant.id),
            slug: String(tenant.slug),
        });
        await recordAudit({
            ctx,
            action: "handoff_link_issued",
            entityKind: "user",
            entityId: Number(target.id),
            trx: currentTrx(),
        });
        return { data: { handoff_url: link.url, expires_at: link.expires_at } };
    }

    /** Owner self-transfer to another active admin. The previous owner stays a normal admin. */
    async makeOwner(ctx: HttpContext) {
        const { tenant, target, error } = await this.loadTarget(ctx);
        if (error) return error;
        this.assertOwner(ctx, tenant);
        if (target.role !== "admin" || target.disabledAt !== null) {
            return ctx.response
                .status(422)
                .send({ errors: [{ message: "Target must be an active admin", code: "E_INVALID_OWNER" }] });
        }
        const previousOwner = Number(tenant.ownerUserId);
        tenant.ownerUserId = Number(target.id);
        tenant.useTransaction(currentTrx());
        await tenant.save();
        await recordAudit({
            ctx,
            action: "ownership_transferred",
            entityKind: "tenant",
            entityId: Number(tenant.id),
            payload: { previous_owner_user_id: previousOwner, new_owner_user_id: Number(target.id) },
            trx: currentTrx(),
        });
        return this.respond(ctx, tenant, target);
    }

    private async lifecycle(ctx: HttpContext, kind: "disable" | "remove") {
        const { tenant, target, error } = await this.loadTarget(ctx);
        if (error) return error;
        this.assertOwner(ctx, tenant);
        if (Number(target.id) === Number(tenant.ownerUserId)) {
            return ctx.response
                .status(422)
                .send({ errors: [{ message: "Can't modify the store owner", code: "E_STORE_OWNER_PROTECTED" }] });
        }
        if ((await this.activeAdminCount()) <= 1) {
            return ctx.response
                .status(422)
                .send({ errors: [{ message: "Can't remove the last active admin", code: "E_LAST_ADMIN" }] });
        }
        const trx = currentTrx();
        if (kind === "disable") target.disabledAt = DateTime.utc();
        else target.deletedAt = DateTime.utc();
        target.useTransaction(trx);
        await target.save();
        await trx.from("auth_access_tokens").where("tokenable_id", Number(target.id)).delete();
        await recordAudit({
            ctx,
            action: kind === "disable" ? "operator_disabled" : "operator_removed",
            entityKind: "user",
            entityId: Number(target.id),
            trx,
        });
        if (kind === "remove") return { data: { removed: true } };
        return this.respond(ctx, tenant, target);
    }

    private async loadTarget(ctx: HttpContext) {
        const tenant = await this.currentTenant();
        const target = (await User.query().where("id", ctx.params.id).where("role", "admin").first()) as User | null;
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

    private respond(ctx: HttpContext, tenant: Tenant, target: User) {
        return {
            data: toOperator(target, {
                isStoreOwner: Number(target.id) === Number(tenant.ownerUserId),
                capabilities: computeOperatorCapabilities({
                    callerKind: "admin",
                    callerUserId: Number(ctx.auth.getUserOrFail().id),
                    operator: target,
                    ownerUserId: Number(tenant.ownerUserId),
                    activeAdminCount: 99,
                }),
            }),
        };
    }
}
