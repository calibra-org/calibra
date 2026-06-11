import type { AdminShippingMethod } from "#/lib/types";

/**
 * Shipping-method fixture. There is no first-party `/api/v1/admin/shipping-methods` operation yet, so
 * the screen renders a static, instantly-available shape — relocated verbatim from the deleted
 * `server-repos.ts` `listShippingMethods`. Client-importable (no server imports).
 */
export const SHIPPING_METHODS: AdminShippingMethod[] = [
    {
        id: 1,
        code: "post",
        titleDefault: { fa: "پست عادی", en: "Standard Post" },
        descriptionDefault: { fa: "", en: "" },
    },
    {
        id: 2,
        code: "tipax",
        titleDefault: { fa: "تیپاکس", en: "Tipax" },
        descriptionDefault: { fa: "", en: "" },
    },
];
