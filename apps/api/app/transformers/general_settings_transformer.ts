import type Currency from "#models/currency";
import type { CountryOption } from "#services/currency_config_service";

export interface ProvinceOption {
    code: string;
    nameFa: string;
    nameEn: string;
}

export interface GeneralSettingsInput {
    general: Record<string, unknown>;
    tax: Record<string, unknown>;
    currencies: Currency[];
    provinces: ProvinceOption[];
    countries: readonly CountryOption[];
}

/**
 * Assembles the admin `GET /api/v1/admin/settings/general` response from the `general` + `tax`
 * settings groups plus the reference lists (currencies, IR provinces, countries) that back the
 * form's selects. Editable values sit under typed sections; the option lists sit under `options`.
 */
export function toGeneralSettings(input: GeneralSettingsInput) {
    const { general, tax, currencies, provinces, countries } = input;

    const str = (key: string, fallback = ""): string => (typeof general[key] === "string" ? (general[key] as string) : fallback);
    const num = (key: string, fallback = 0): number => (typeof general[key] === "number" ? (general[key] as number) : fallback);
    const list = (key: string): string[] => (Array.isArray(general[key]) ? (general[key] as string[]) : []);
    const flag = (map: Record<string, unknown>, key: string, fallback: boolean): boolean =>
        typeof map[key] === "boolean" ? (map[key] as boolean) : fallback;

    return {
        store_address: {
            address_1: str("store_address_1"),
            address_2: str("store_address_2"),
            city: str("store_city"),
            state: str("store_state"),
            postcode: str("store_postcode"),
            country: str("country_default", "IR"),
        },
        general_options: {
            selling_locations: str("selling_locations", "specific"),
            selling_locations_specific: list("selling_locations_specific"),
            selling_locations_excluded: list("selling_locations_excluded"),
            shipping_locations: str("shipping_locations", ""),
            shipping_locations_specific: list("shipping_locations_specific"),
            default_customer_location: str("default_customer_location", "base"),
            address_autocomplete: flag(general, "address_autocomplete", false),
        },
        taxes_and_coupons: {
            taxes_enabled: flag(tax, "enabled", true),
            coupons_enabled: flag(tax, "coupons_enabled", true),
            calc_discounts_sequentially: flag(tax, "calc_discounts_sequentially", false),
        },
        currency: {
            base: str("currency", "IRR"),
            display: str("currency_display_default", "IRT"),
            position: str("currency_position", "right_space"),
            thousand_sep: str("price_thousand_sep", "٬"),
            decimal_sep: str("price_decimal_sep", "."),
            num_decimals: num("price_num_decimals", 0),
        },
        options: {
            currencies: currencies.map((c) => ({
                code: c.code,
                symbol: c.symbol,
                name: { fa: c.nameFa, en: c.nameEn },
                decimals: c.decimals,
                position: c.position,
                base_ratio: c.baseRatio,
                enabled: c.enabled,
            })),
            provinces: provinces.map((p) => ({ code: p.code, name: { fa: p.nameFa, en: p.nameEn } })),
            countries: countries.map((c) => ({ code: c.code, name: { fa: c.nameFa, en: c.nameEn }, enabled: c.enabled })),
        },
    };
}
