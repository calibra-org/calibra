import type { AdminTaxClass } from "#/lib/types";

/**
 * Tax-class fixture. There is no first-party `/api/v1/admin/tax-classes` operation yet, so the screen
 * renders a static, instantly-available shape — relocated verbatim from the deleted `server-repos.ts`
 * `listTaxClasses`. Client-importable (no server imports).
 */
export const TAX_CLASSES: AdminTaxClass[] = [
    { id: 1, slug: "standard", name: { fa: "استاندارد", en: "Standard" }, rateCount: 1 },
    { id: 2, slug: "zero", name: { fa: "بدون مالیات", en: "Zero" }, rateCount: 0 },
];
