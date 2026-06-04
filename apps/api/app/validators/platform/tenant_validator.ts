import vine from "@vinejs/vine";

/** Tenant slug: lowercase alphanumerics joined by single dashes (matches `TenantProvisioningService`). */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TENANT_STATUSES = ["active", "suspended", "archived"] as const;

/**
 * Provision a new shop. The control-plane form is a thin wrapper over
 * `TenantProvisioningService.provision` (RULE B) — slug reservation + format are re-checked there,
 * and the owner contact requirement (email OR phone) is enforced in the controller since VineJS
 * can't express "at least one of" cleanly.
 */
export const createTenantValidator = vine.compile(
    vine.object({
        slug: vine.string().trim().toLowerCase().minLength(2).maxLength(40).regex(SLUG_RE),
        name: vine.string().trim().minLength(1).maxLength(120),
        plan_key: vine.string().trim().minLength(1).maxLength(48),
        currency_code: vine.string().trim().minLength(3).maxLength(8),
        primary_locale: vine.string().trim().minLength(2).maxLength(8).optional(),
        template_key: vine.string().trim().minLength(1).maxLength(48).optional(),
        owner_email: vine.string().trim().email().maxLength(254).optional(),
        owner_phone: vine.string().trim().maxLength(32).optional(),
    }),
);

/** Update a shop's profile / lifecycle. All optional — the controller writes only surfaced keys. */
export const updateTenantValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(120).optional(),
        plan_key: vine.string().trim().minLength(1).maxLength(48).optional(),
        status: vine.enum(TENANT_STATUSES).optional(),
        template_key: vine.string().trim().minLength(1).maxLength(48).optional(),
        currency_code: vine.string().trim().minLength(3).maxLength(8).optional(),
    }),
);
