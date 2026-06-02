import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import { DateTime } from "luxon";

import Customer from "#models/customer";
import CustomerMarketingConsentHistory from "#models/customer_marketing_consent_history";
import CustomerMarketingPref from "#models/customer_marketing_pref";
import { recordAudit } from "#services/admin_audit_log_service";
import { withTenantTransaction } from "#services/tenant_context";
import CustomerMarketingConsentHistoryTransformer from "#transformers/customer_marketing_consent_history_transformer";
import CustomerMarketingPrefTransformer from "#transformers/customer_marketing_pref_transformer";
import { adminCustomerMarketingPatchValidator } from "#validators/admin/customer_validator";

const CHANNEL_TO_FIELDS: Record<
    string,
    {
        optIn: "emailOptIn" | "smsOptIn" | "phoneCallOptIn";
        at: "emailOptInAt" | "smsOptInAt" | "phoneCallOptInAt";
        source: "emailOptInSource" | "smsOptInSource" | "phoneCallOptInSource";
    }
> = {
    email: { optIn: "emailOptIn", at: "emailOptInAt", source: "emailOptInSource" },
    sms: { optIn: "smsOptIn", at: "smsOptInAt", source: "smsOptInSource" },
    phone: { optIn: "phoneCallOptIn", at: "phoneCallOptInAt", source: "phoneCallOptInSource" },
};

export default class AdminCustomerMarketingController {
    async show(ctx: HttpContext) {
        const customer = await this.findCustomerOrFail(ctx.params.id);
        const prefs = await CustomerMarketingPref.findBy("customer_id", Number(customer.id));
        const data = prefs
            ? new CustomerMarketingPrefTransformer(prefs).toObject()
            : CustomerMarketingPrefTransformer.defaults(Number(customer.id));
        return { data };
    }

    /**
     * PATCH /:id/marketing — single channel toggle with history.
     *
     * **Settle-then-persist (backend half).** Returns 200 with the current row and writes NO
     * history / audit when the incoming `opt_in` already matches what the prefs row holds — so a
     * client that debounces a toggle and lands back on the original value produces zero rows,
     * not two. Pair with the {@link useSettleMutation} hook on the frontend; together they keep
     * the consent timeline a record of intent, not flicker. See AGENTS.md → Settle-then-persist.
     */
    async update(ctx: HttpContext) {
        const customer = await this.findCustomerOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminCustomerMarketingPatchValidator);
        const fields = CHANNEL_TO_FIELDS[payload.channel];
        const now = DateTime.utc();

        const { row, changed } = await withTenantTransaction(async (trx) => {
            let prefs = await CustomerMarketingPref.findBy("customer_id", Number(customer.id), { client: trx });
            if (!prefs) {
                prefs = await CustomerMarketingPref.create(
                    {
                        customerId: Number(customer.id),
                        emailOptIn: false,
                        smsOptIn: false,
                        phoneCallOptIn: false,
                    },
                    { client: trx },
                );
            }
            const previousValue = prefs[fields.optIn];
            if (previousValue === payload.opt_in) {
                return { row: prefs, changed: false };
            }
            prefs.useTransaction(trx);
            prefs[fields.optIn] = payload.opt_in;
            prefs[fields.at] = now;
            prefs[fields.source] = payload.source ?? "admin";
            await prefs.save();

            const history = new CustomerMarketingConsentHistory();
            history.customerId = Number(customer.id);
            history.channel = payload.channel;
            history.optedIn = payload.opt_in;
            history.source = payload.source ?? "admin";
            history.occurredAt = now;
            history.useTransaction(trx);
            try {
                const auth = await ctx.auth.authenticate();
                history.actorUserId = Number(auth.id);
            } catch {
                history.actorUserId = null;
            }
            await history.save();

            return { row: prefs, changed: true };
        });

        if (changed) {
            await recordAudit({
                ctx,
                action: "customer.marketing.patch",
                entityKind: "customer",
                entityId: Number(customer.id),
                payload: { channel: payload.channel, opt_in: payload.opt_in, source: payload.source ?? "admin" },
            });
        }

        return { data: new CustomerMarketingPrefTransformer(row).toObject() };
    }

    async history(ctx: HttpContext) {
        const customer = await this.findCustomerOrFail(ctx.params.id);
        const page = Number(ctx.request.input("page", 1));
        const limit = Math.min(Number(ctx.request.input("limit", 25)), 100);
        const paginator = await CustomerMarketingConsentHistory.query()
            .where("customer_id", Number(customer.id))
            .preload("actor")
            .orderBy("occurred_at", "desc")
            .paginate(page, limit);
        const meta = paginator.getMeta();
        return {
            data: paginator.all().map((r) => new CustomerMarketingConsentHistoryTransformer(r).toObject()),
            meta: {
                page: meta.currentPage,
                limit: meta.perPage,
                total: meta.total,
                lastPage: meta.lastPage,
            },
        };
    }

    private async findCustomerOrFail(id: unknown) {
        const numeric = Number(id);
        if (!Number.isFinite(numeric)) throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
        const customer = await Customer.query().where("id", numeric).whereNull("deleted_at").first();
        if (!customer) throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
        return customer;
    }
}
