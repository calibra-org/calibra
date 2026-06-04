import type Plan from "#models/plan";

/** Wire shape for a control-plane plan tier. `limits` is the free-form jsonb bag stored as-is. */
export function toPlan(plan: Plan) {
    return {
        id: Number(plan.id),
        key: plan.key,
        name: plan.name,
        db_tier: plan.dbTier,
        is_default: plan.isDefault,
        limits: plan.limits ?? {},
    };
}
