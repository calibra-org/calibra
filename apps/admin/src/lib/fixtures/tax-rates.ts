import type { AdminTaxRate } from "#/lib/types";

/**
 * Tax-rate fixture. There is no first-party `/api/v1/admin/tax-rates` operation yet, so the screen
 * renders a static, instantly-available shape — relocated verbatim from the deleted `server-repos.ts`
 * `listTaxRates`. Client-importable (no server imports).
 */
export const TAX_RATES: AdminTaxRate[] = [
    {
        id: 1,
        taxClassId: 1,
        country: "IR",
        provinceCode: null,
        cities: null,
        ratePercent: 9,
        label: { fa: "مالیات بر ارزش افزوده", en: "VAT" },
        priority: 1,
        compound: false,
        appliesToShipping: false,
    },
];
