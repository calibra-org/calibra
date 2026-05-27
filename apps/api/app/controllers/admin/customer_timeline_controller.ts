import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import vine, { errors as vineErrors } from "@vinejs/vine";

import Customer from "#models/customer";

interface TimelineRow {
    kind: string;
    occurred_at: string;
    payload: Record<string, unknown>;
    actor: { id: string; email: string } | null;
}

/**
 * Allow-listed top-level wire keys for the timeline. The endpoint can't go through TableView
 * because the data is stitched across six tables in-controller (no single model the runtime
 * could point at); we keep the wire surface uniform by enforcing strict-keys here.
 */
const TIMELINE_ALLOWED_KEYS = new Set<string>([
    "page",
    "limit",
    "types",
    "params",
    "headers",
    "cookies",
]);

const timelineQueryValidator = vine.compile(
    vine.object({
        page: vine.number().withoutDecimals().min(1).optional(),
        limit: vine.number().withoutDecimals().min(1).max(200).optional(),
        types: vine.string().trim().maxLength(120).optional(),
    }),
);

/**
 * Returns a merged activity feed for a single customer — orders + notes + status flips +
 * marketing-consent flips + impersonations + audit. Result is sorted newest-first across all
 * sources. The `types` query param filters to a subset; `limit` caps the per-page row count
 * (default 50, max 200). Strict-keys at the wire (any other top-level key returns 422).
 */
export default class AdminCustomerTimelineController {
    async index(ctx: HttpContext) {
        const customer = await this.findCustomerOrFail(ctx.params.id);

        const qs = ctx.request.qs() as Record<string, unknown>;
        for (const key of Object.keys(qs)) {
            if (!TIMELINE_ALLOWED_KEYS.has(key)) {
                throw new vineErrors.E_VALIDATION_ERROR([
                    {
                        message: `Unknown query parameter "${key}" — see /docs for the allowed list`,
                        rule: "table_view.unknown_query_key",
                        field: key,
                    },
                ]);
            }
        }
        const parsed = await timelineQueryValidator.validate(qs);
        const page = parsed.page ?? 1;
        const limit = parsed.limit ?? 50;
        const requestedTypes = (parsed.types ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        const includeAll = requestedTypes.length === 0;
        const wants = (type: string) => includeAll || requestedTypes.includes(type);

        const customerId = Number(customer.id);
        const rows: TimelineRow[] = [];

        if (wants("order")) {
            const orders = await db
                .from("orders")
                .select("id", "order_number", "status", "grand_total", "currency", "created_at")
                .where("customer_id", customerId)
                .orderBy("created_at", "desc")
                .limit(limit);
            for (const o of orders) {
                rows.push({
                    kind: "order",
                    occurred_at: new Date(o.created_at).toISOString(),
                    payload: {
                        order_id: String(o.id),
                        number: String(o.order_number),
                        status: o.status,
                        grand_total_minor: Number(o.grand_total),
                        currency: o.currency,
                    },
                    actor: null,
                });
            }
        }

        if (wants("note")) {
            const notes = await db
                .from("customer_notes as n")
                .leftJoin("users as u", "u.id", "n.author_user_id")
                .select("n.id", "n.body", "n.created_at", "u.id as author_id", "u.email as author_email")
                .where("n.customer_id", customerId)
                .orderBy("n.created_at", "desc")
                .limit(limit);
            for (const n of notes) {
                rows.push({
                    kind: "note",
                    occurred_at: new Date(n.created_at).toISOString(),
                    payload: { note_id: String(n.id), body: n.body },
                    actor: n.author_id ? { id: String(n.author_id), email: n.author_email } : null,
                });
            }
        }

        if (wants("status")) {
            const status = await db
                .from("customer_status_history as h")
                .leftJoin("users as u", "u.id", "h.actor_user_id")
                .select(
                    "h.id",
                    "h.from_status",
                    "h.to_status",
                    "h.reason",
                    "h.occurred_at",
                    "u.id as actor_id",
                    "u.email as actor_email",
                )
                .where("h.customer_id", customerId)
                .orderBy("h.occurred_at", "desc")
                .limit(limit);
            for (const s of status) {
                rows.push({
                    kind: "status",
                    occurred_at: new Date(s.occurred_at).toISOString(),
                    payload: { from: s.from_status, to: s.to_status, reason: s.reason },
                    actor: s.actor_id ? { id: String(s.actor_id), email: s.actor_email } : null,
                });
            }
        }

        if (wants("marketing")) {
            const mkt = await db
                .from("customer_marketing_consent_history as h")
                .leftJoin("users as u", "u.id", "h.actor_user_id")
                .select(
                    "h.id",
                    "h.channel",
                    "h.opted_in",
                    "h.source",
                    "h.occurred_at",
                    "u.id as actor_id",
                    "u.email as actor_email",
                )
                .where("h.customer_id", customerId)
                .orderBy("h.occurred_at", "desc")
                .limit(limit);
            for (const m of mkt) {
                rows.push({
                    kind: "marketing",
                    occurred_at: new Date(m.occurred_at).toISOString(),
                    payload: { channel: m.channel, opt_in: m.opted_in, source: m.source },
                    actor: m.actor_id ? { id: String(m.actor_id), email: m.actor_email } : null,
                });
            }
        }

        if (wants("impersonation")) {
            const imp = await db
                .from("customer_impersonation_events as e")
                .leftJoin("users as u", "u.id", "e.impersonator_user_id")
                .select("e.id", "e.started_at", "e.ended_at", "u.id as actor_id", "u.email as actor_email")
                .where("e.customer_id", customerId)
                .orderBy("e.started_at", "desc")
                .limit(limit);
            for (const e of imp) {
                rows.push({
                    kind: "impersonation",
                    occurred_at: new Date(e.started_at).toISOString(),
                    payload: { event_id: String(e.id), ended_at: e.ended_at ? new Date(e.ended_at).toISOString() : null },
                    actor: e.actor_id ? { id: String(e.actor_id), email: e.actor_email } : null,
                });
            }
        }

        rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

        /** Wire-level pagination over the stitched merge. The TableView envelope shape stays
         * consistent across every list endpoint even when the underlying data isn't a single
         * model the runtime could point at. */
        const total = rows.length;
        const lastPage = Math.max(1, Math.ceil(total / limit));
        const start = (page - 1) * limit;
        const slice = rows.slice(start, start + limit);
        return {
            data: slice,
            meta: { page, limit, total, lastPage },
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
