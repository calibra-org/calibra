import vine from "@vinejs/vine";

const passwordRule = vine
    .string()
    .minLength(8)
    .maxLength(128)
    .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/);

const createShape = vine.object({
    first_name: vine.string().trim().minLength(1).maxLength(80),
    last_name: vine.string().trim().minLength(1).maxLength(80),
    /**
     * Admin can create either a guest customer (no email/password — `user_id` stays null) or a
     * full account customer (email + password). Both fields are individually optional but the
     * controller paths require them together; that's enforced after validation so the error message
     * can be a single "provide both or neither" rather than two separate field errors.
     */
    email: vine.string().trim().email().maxLength(254).optional(),
    password: passwordRule.optional(),
    role: vine.enum(["customer", "admin"]).optional(),
    phone: vine.string().trim().minLength(4).maxLength(32).optional().nullable(),
    country_default: vine.string().trim().fixedLength(2).optional(),
});

const updateShape = vine.object({
    first_name: vine.string().trim().minLength(1).maxLength(80).optional(),
    last_name: vine.string().trim().minLength(1).maxLength(80).optional(),
    phone: vine.string().trim().minLength(4).maxLength(32).optional().nullable(),
    country_default: vine.string().trim().fixedLength(2).optional(),
    role: vine.enum(["customer", "admin"]).optional(),
    locale: vine.string().trim().maxLength(8).optional(),
});

export const adminCustomerCreateValidator = vine.compile(createShape);
export const adminCustomerUpdateValidator = vine.compile(updateShape);

export const adminCustomerListValidator = vine.compile(
    vine.object({
        page: vine.number().positive().optional(),
        perPage: vine.number().positive().max(100).optional(),
        search: vine.string().trim().minLength(1).maxLength(120).optional(),
        role: vine.enum(["customer", "admin"]).optional(),
        is_paying_customer: vine.boolean().optional(),
        country: vine.string().trim().fixedLength(2).optional(),
    }),
);

export const adminCustomerBatchValidator = vine.compile(
    vine.object({
        create: vine.array(createShape).optional(),
        update: vine
            .array(
                vine.object({
                    id: vine.number().positive(),
                    first_name: vine.string().trim().minLength(1).maxLength(80).optional(),
                    last_name: vine.string().trim().minLength(1).maxLength(80).optional(),
                    phone: vine.string().trim().minLength(4).maxLength(32).optional().nullable(),
                    country_default: vine.string().trim().fixedLength(2).optional(),
                    role: vine.enum(["customer", "admin"]).optional(),
                }),
            )
            .optional(),
        delete: vine.array(vine.number().positive()).optional(),
    }),
);
