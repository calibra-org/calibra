import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import Plan from "#models/plan";
import { toPlan } from "#transformers/platform/plan_transformer";
import { createPlanValidator, updatePlanValidator } from "#validators/platform/plan_validator";

function admin() {
    return db.connection("postgres_admin");
}

/**
 * Control-plane plan-tier management. Plans are global reference data (no RLS). Setting a plan as
 * the default clears the flag on every other plan in the same transaction so there is always at
 * most one default. Guarded by `platformAuth`.
 */
export default class PlatformPlansController {
    /** All plan tiers, ordered by key. Not paginated — the set is small and fully shown. */
    async index(_ctx: HttpContext) {
        const plans = await Plan.query({ client: admin() }).orderBy("key", "asc");
        return { data: plans.map(toPlan) };
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createPlanValidator);
        const clash = await admin().from("plans").where("key", payload.key).first();
        if (clash) {
            return ctx.response
                .status(409)
                .send({ errors: [{ message: "Plan key already exists", code: "E_PLAN_TAKEN", field: "key" }] });
        }

        const now = DateTime.utc().toSQL()!;
        const id = await admin().transaction(async (trx) => {
            if (payload.is_default) await trx.from("plans").update({ is_default: false, updated_at: now });
            const rows = await trx
                .table("plans")
                .insert({
                    key: payload.key,
                    name: payload.name,
                    db_tier: payload.db_tier ?? "shared",
                    is_default: payload.is_default ?? false,
                    limits: JSON.stringify(payload.limits ?? {}),
                    created_at: now,
                    updated_at: now,
                })
                .returning(["id"]);
            return Number(rows[0].id);
        });

        const plan = await Plan.query({ client: admin() }).where("id", id).firstOrFail();
        ctx.response.status(201);
        return { data: toPlan(plan) };
    }

    async update(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(updatePlanValidator);
        const plan = await Plan.query({ client: admin() }).where("id", ctx.params.id).first();
        if (!plan) {
            return ctx.response.status(404).send({ errors: [{ message: "Plan not found", code: "E_PLAN_NOT_FOUND" }] });
        }

        const now = DateTime.utc().toSQL()!;
        const patch: Record<string, unknown> = { updated_at: now };
        if (payload.name !== undefined) patch.name = payload.name;
        if (payload.db_tier !== undefined) patch.db_tier = payload.db_tier;
        if (payload.is_default !== undefined) patch.is_default = payload.is_default;
        if (payload.limits !== undefined) patch.limits = JSON.stringify(payload.limits);

        const planId = Number(plan.id);
        await admin().transaction(async (trx) => {
            if (payload.is_default === true)
                await trx.from("plans").whereNot("id", planId).update({ is_default: false, updated_at: now });
            await trx.from("plans").where("id", planId).update(patch);
        });

        const fresh = await Plan.query({ client: admin() }).where("id", ctx.params.id).firstOrFail();
        return { data: toPlan(fresh) };
    }
}
