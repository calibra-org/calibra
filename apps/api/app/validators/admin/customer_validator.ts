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
    acquisition_channel: vine.string().trim().maxLength(32).optional(),
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

/**
 * Extended list validator. `page`/`perPage`/`search` keep the original shape; everything else is
 * brand new for the WP/Shopify-grade filtering surface. Arrays use the comma-separated wire form
 * by way of `csvArray` so URL serialization stays compact.
 */
/**
 * Parses a comma-separated query value into a clean string array. URLs like
 * `?tags=vip,wholesale,b2b` deserialize to the array form the controller expects.
 */
const csvArray = <T extends string>() =>
    vine.any().transform((value): T[] => {
        if (value === undefined || value === null || value === "") return [];
        const arr = Array.isArray(value) ? value : String(value).split(",");
        return arr.map((v) => String(v).trim()).filter((v) => v.length > 0) as T[];
    });

export const adminCustomerListValidator = vine.compile(
    vine.object({
        page: vine.number().positive().optional(),
        perPage: vine.number().positive().max(100).optional(),
        search: vine.string().trim().minLength(1).maxLength(120).optional(),
        sort: vine.string().trim().maxLength(64).optional(),
        role: vine.enum(["customer", "admin"]).optional(),
        is_paying_customer: vine.boolean().optional(),
        country: vine.string().trim().fixedLength(2).optional(),
        include_stats: vine.boolean().optional(),
        tab: vine.enum(["any", "account", "guest", "big", "new", "inactive", "no_address", "trashed"]).optional(),
        countries: csvArray<string>().optional(),
        cities: csvArray<string>().optional(),
        regions: csvArray<string>().optional(),
        tags: csvArray<string>().optional(),
        statuses: csvArray<string>().optional(),
        acquisition_channels: csvArray<string>().optional(),
        email_verified: vine.boolean().optional(),
        opt_in_email: vine.boolean().optional(),
        opt_in_sms: vine.boolean().optional(),
        created_after: vine.string().trim().optional(),
        created_before: vine.string().trim().optional(),
        last_order_after: vine.string().trim().optional(),
        last_order_before: vine.string().trim().optional(),
        order_count_min: vine.number().min(0).optional(),
        order_count_max: vine.number().min(0).optional(),
        lifetime_spend_min: vine.number().min(0).optional(),
        lifetime_spend_max: vine.number().min(0).optional(),
        aov_min: vine.number().min(0).optional(),
        aov_max: vine.number().min(0).optional(),
        has_national_id: vine.boolean().optional(),
        with_orders: vine.boolean().optional(),
        no_orders: vine.boolean().optional(),
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
        tag_add: vine.array(vine.string().trim().minLength(1).maxLength(40)).optional(),
        tag_remove: vine.array(vine.string().trim().minLength(1).maxLength(40)).optional(),
        status_change: vine.enum(["active", "suspended"]).optional(),
        send_password_reset: vine.array(vine.number().positive()).optional(),
    }),
);

export const adminCustomerNoteCreateValidator = vine.compile(
    vine.object({
        body: vine.string().trim().minLength(1).maxLength(2000),
    }),
);

export const adminCustomerNoteUpdateValidator = vine.compile(
    vine.object({
        body: vine.string().trim().minLength(1).maxLength(2000),
    }),
);

export const adminCustomerTagCreateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(40),
    }),
);

export const adminCustomerTagAttachValidator = vine.compile(
    vine.object({
        tag: vine.string().trim().minLength(1).maxLength(40),
    }),
);

export const adminCustomerSegmentValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(80),
        filters: vine.any(),
        is_pinned: vine.boolean().optional(),
    }),
);

export const adminCustomerMarketingPatchValidator = vine.compile(
    vine.object({
        channel: vine.enum(["email", "sms", "phone"]),
        opt_in: vine.boolean(),
        source: vine.string().trim().maxLength(64).optional(),
    }),
);

export const adminCustomerStatusPatchValidator = vine.compile(
    vine.object({
        status: vine.enum(["active", "suspended"]),
        reason: vine.string().trim().maxLength(500).optional(),
    }),
);

export const adminCustomerConvertToAccountValidator = vine.compile(
    vine.object({
        email: vine.string().trim().email().maxLength(254),
        password: passwordRule.optional(),
        send_password_reset_email: vine.boolean().optional(),
    }),
);

export const adminCustomerMergeValidator = vine.compile(
    vine.object({
        primary_id: vine.number().positive(),
        duplicate_ids: vine.array(vine.number().positive()).minLength(1),
        strategy: vine
            .object({
                addresses: vine.enum(["keep_primary", "merge_all"]).optional(),
                tags: vine.enum(["union", "keep_primary"]).optional(),
                marketing_prefs: vine.enum(["most_recent", "keep_primary"]).optional(),
            })
            .optional(),
    }),
);

export const adminCustomerAddressCreateValidator = vine.compile(
    vine.object({
        kind: vine.enum(["billing", "shipping", "both"]),
        first_name: vine.string().trim().minLength(1).maxLength(80),
        last_name: vine.string().trim().minLength(1).maxLength(80),
        company: vine.string().trim().maxLength(200).optional().nullable(),
        address_line_1: vine.string().trim().minLength(1).maxLength(255),
        address_line_2: vine.string().trim().maxLength(255).optional().nullable(),
        city: vine.string().trim().minLength(1).maxLength(120),
        region_id: vine.number().positive().optional().nullable(),
        region_text: vine.string().trim().maxLength(120).optional().nullable(),
        postcode: vine.string().trim().maxLength(20).optional().nullable(),
        country: vine.string().trim().fixedLength(2),
        phone: vine.string().trim().minLength(4).maxLength(32).optional().nullable(),
        is_default: vine.boolean().optional(),
        label: vine.string().trim().maxLength(80).optional().nullable(),
    }),
);

export const adminCustomerAddressUpdateValidator = vine.compile(
    vine.object({
        kind: vine.enum(["billing", "shipping", "both"]).optional(),
        first_name: vine.string().trim().minLength(1).maxLength(80).optional(),
        last_name: vine.string().trim().minLength(1).maxLength(80).optional(),
        company: vine.string().trim().maxLength(200).optional().nullable(),
        address_line_1: vine.string().trim().minLength(1).maxLength(255).optional(),
        address_line_2: vine.string().trim().maxLength(255).optional().nullable(),
        city: vine.string().trim().minLength(1).maxLength(120).optional(),
        region_id: vine.number().positive().optional().nullable(),
        region_text: vine.string().trim().maxLength(120).optional().nullable(),
        postcode: vine.string().trim().maxLength(20).optional().nullable(),
        country: vine.string().trim().fixedLength(2).optional(),
        phone: vine.string().trim().minLength(4).maxLength(32).optional().nullable(),
        is_default: vine.boolean().optional(),
        label: vine.string().trim().maxLength(80).optional().nullable(),
    }),
);
