import vine from "@vinejs/vine";

const DB_TIERS = ["shared", "dedicated"] as const;

/**
 * Plan limits are a free-form numeric bag (`max_products`, `max_storage_bytes`,
 * `max_orders_per_month`, `max_staff`, …). Accept any numeric-valued record so new limit keys don't
 * require a validator change; the console surfaces whichever keys are present.
 */
const limits = vine.record(vine.number().min(0)).optional();

export const createPlanValidator = vine.compile(
    vine.object({
        key: vine
            .string()
            .trim()
            .toLowerCase()
            .minLength(2)
            .maxLength(48)
            .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
        name: vine.string().trim().minLength(1).maxLength(120),
        db_tier: vine.enum(DB_TIERS).optional(),
        is_default: vine.boolean().optional(),
        limits,
    }),
);

export const updatePlanValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(120).optional(),
        db_tier: vine.enum(DB_TIERS).optional(),
        is_default: vine.boolean().optional(),
        limits,
    }),
);
