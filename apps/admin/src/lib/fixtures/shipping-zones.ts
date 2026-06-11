import type { AdminShippingZone } from "#/lib/types";

/**
 * Shipping-zone fixture. There is no first-party `/api/v1/admin/shipping-zones` operation yet, so the
 * screen renders a static, instantly-available shape — relocated verbatim from the deleted
 * `server-repos.ts` `listShippingZones`. Client-importable (no server imports).
 */
export const SHIPPING_ZONES: AdminShippingZone[] = [
    { id: 1, name: { fa: "ایران", en: "Iran" }, isFallback: false, countries: ["IR"], methodCount: 2 },
    { id: 2, name: { fa: "سایر کشورها", en: "Rest of World" }, isFallback: true, countries: [], methodCount: 1 },
];
