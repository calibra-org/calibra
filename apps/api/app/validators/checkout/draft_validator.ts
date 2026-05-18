import vine from "@vinejs/vine";

/**
 * Address subobject shared between the storefront draft validator and the admin order create
 * validator. The country-aware rules layer ({@link app/services/country_address_rules/index.ts})
 * runs a second pass for postcode / region / extension checks; this layer covers shape only.
 */
const addressShape = vine.object({
    first_name: vine.string().trim().minLength(1).maxLength(80),
    last_name: vine.string().trim().minLength(1).maxLength(80),
    company: vine.string().trim().maxLength(200).optional().nullable(),
    address_line_1: vine.string().trim().minLength(1).maxLength(255),
    address_line_2: vine.string().trim().maxLength(255).optional().nullable(),
    city: vine.string().trim().minLength(1).maxLength(120),
    region_id: vine.number().positive().optional().nullable(),
    region_text: vine.string().trim().maxLength(200).optional().nullable(),
    postcode: vine.string().trim().maxLength(20).optional().nullable(),
    country: vine.string().trim().fixedLength(2),
    phone: vine.string().trim().minLength(4).maxLength(32).optional().nullable(),
    email: vine.string().trim().email().maxLength(254).optional().nullable(),
});

const iranExtensionShape = vine.object({
    national_id: vine
        .string()
        .trim()
        .fixedLength(10)
        .regex(/^\d{10}$/)
        .optional()
        .nullable(),
    corporate_national_id: vine
        .string()
        .trim()
        .fixedLength(11)
        .regex(/^\d{11}$/)
        .optional()
        .nullable(),
    economic_code: vine
        .string()
        .trim()
        .regex(/^\d{12}$/)
        .optional()
        .nullable(),
    legal_company_name_fa: vine.string().trim().maxLength(200).optional().nullable(),
});

/**
 * `PUT /api/v1/checkout` payload. Every field is optional because the storefront sends partial
 * updates as the customer types; the controller folds the patch onto the existing draft.
 */
export const checkoutDraftValidator = vine.compile(
    vine.object({
        billing_address: addressShape.optional(),
        shipping_address: addressShape.optional(),
        billing_iran_extension: iranExtensionShape.optional().nullable(),
        shipping_iran_extension: iranExtensionShape.optional().nullable(),
        payment_gateway_id: vine.number().positive().optional(),
        customer_note: vine.string().trim().maxLength(2000).optional().nullable(),
    }),
);

export type CheckoutDraftPayload = Awaited<ReturnType<typeof checkoutDraftValidator.validate>>;

/**
 * `POST /api/v1/checkout/orders/:order_key/pay` payload — guest pay-link retry. The order is
 * located by `order_key`; the only mutable field is the chosen gateway.
 */
export const payLinkValidator = vine.compile(
    vine.object({
        payment_gateway_id: vine.number().positive(),
    }),
);
