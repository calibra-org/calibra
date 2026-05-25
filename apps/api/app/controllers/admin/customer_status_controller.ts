import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import Customer from "#models/customer";
import CustomerStatusHistory from "#models/customer_status_history";
import { recordAudit } from "#services/admin_audit_log_service";
import { CacheInvalidation } from "#services/cache_invalidation";
import CustomerStatusHistoryTransformer from "#transformers/customer_status_history_transformer";
import { adminCustomerStatusPatchValidator } from "#validators/admin/customer_validator";

const ACTIVE_ORDER_STATUSES = ["pending", "on_hold", "processing"];

export default class AdminCustomerStatusController {
    /**
     * PATCH /:id/status — flip a customer between active/suspended (deleted is set elsewhere via
     * the soft-delete endpoint). Suspending an account with active orders responds 409 unless
     * `?force=1` is set, so admins are warned before locking out a customer mid-fulfilment.
     */
    async update(ctx: HttpContext) {
        const customer = await this.findCustomerOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminCustomerStatusPatchValidator);
        const force = ctx.request.input("force") === "1" || ctx.request.input("force") === "true";

        if (payload.status === "suspended" && !force) {
            const activeRow = await db
                .from("orders")
                .where("customer_id", Number(customer.id))
                .whereIn("status", ACTIVE_ORDER_STATUSES)
                .count("* as count")
                .first();
            const activeCount = Number(activeRow?.count ?? 0);
            if (activeCount > 0) {
                throw new Exception("Customer has active orders", {
                    status: 409,
                    code: "E_HAS_ACTIVE_ORDERS",
                });
            }
        }

        const previousStatus = customer.status ?? "active";
        if (previousStatus === payload.status) {
            return { data: { from_status: previousStatus, to_status: payload.status, reason: null } };
        }

        const historyRow = await db.transaction(async (trx) => {
            customer.useTransaction(trx);
            customer.status = payload.status;
            await customer.save();
            const history = new CustomerStatusHistory();
            history.customerId = Number(customer.id);
            history.fromStatus = previousStatus;
            history.toStatus = payload.status;
            history.reason = payload.reason ?? null;
            history.occurredAt = DateTime.utc();
            history.useTransaction(trx);
            try {
                const auth = await ctx.auth.authenticate();
                history.actorUserId = Number(auth.id);
            } catch {
                history.actorUserId = null;
            }
            await history.save();
            return history;
        });

        await recordAudit({
            ctx,
            action: "customer.status.patch",
            entityKind: "customer",
            entityId: Number(customer.id),
            payload: { from: previousStatus, to: payload.status, reason: payload.reason ?? null },
        });
        await CacheInvalidation.customerChanged(customer.id);

        return { data: new CustomerStatusHistoryTransformer(historyRow).toObject() };
    }

    /** GET /:id/status-history — full audit trail of status flips. */
    async history(ctx: HttpContext) {
        const customer = await this.findCustomerOrFail(ctx.params.id);
        const rows = await CustomerStatusHistory.query()
            .where("customer_id", Number(customer.id))
            .preload("actor")
            .orderBy("occurred_at", "desc");
        return { data: rows.map((r) => new CustomerStatusHistoryTransformer(r).toObject()) };
    }

    private async findCustomerOrFail(id: unknown) {
        const numeric = Number(id);
        if (!Number.isFinite(numeric)) throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
        const customer = await Customer.query().where("id", numeric).whereNull("deleted_at").preload("user").first();
        if (!customer) throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
        return customer;
    }
}
