import type { MoneyFormatConfig } from "@calibra/shared/money";
import { z } from "zod";

import type { AdminGeneralSettings, AdminGeneralSettingsUpdate } from "#/lib/queries/general-settings";

export const generalFormSchema = z.object({
    storeAddress1: z.string().max(255),
    storeAddress2: z.string().max(255),
    storeCity: z.string().max(120),
    storeState: z.string().max(16),
    storePostcode: z.string().max(20),
    country: z.string().max(2),
    sellingLocations: z.enum(["all", "all_except", "specific"]),
    shippingLocations: z.enum(["", "all", "specific", "disabled"]),
    defaultCustomerLocation: z.enum(["none", "base", "geolocation", "geolocation_ajax"]),
    addressAutocomplete: z.boolean(),
    taxesEnabled: z.boolean(),
    couponsEnabled: z.boolean(),
    calcDiscountsSequentially: z.boolean(),
    currencyDisplay: z.string().min(1),
    currencyPosition: z.enum(["left", "right", "left_space", "right_space"]),
    thousandSep: z.string().min(1).max(3),
    decimalSep: z.string().min(1).max(3),
    numDecimals: z.number().int().min(0).max(4),
});

export type GeneralForm = z.infer<typeof generalFormSchema>;

/** Map the API response into the flat form shape (location-specific arrays stay server-side). */
export function toForm(settings: AdminGeneralSettings): GeneralForm {
    return {
        storeAddress1: settings.store_address.address_1,
        storeAddress2: settings.store_address.address_2,
        storeCity: settings.store_address.city,
        storeState: settings.store_address.state,
        storePostcode: settings.store_address.postcode,
        country: settings.store_address.country,
        sellingLocations: settings.general_options.selling_locations,
        shippingLocations: settings.general_options.shipping_locations,
        defaultCustomerLocation: settings.general_options.default_customer_location,
        addressAutocomplete: settings.general_options.address_autocomplete,
        taxesEnabled: settings.taxes_and_coupons.taxes_enabled,
        couponsEnabled: settings.taxes_and_coupons.coupons_enabled,
        calcDiscountsSequentially: settings.taxes_and_coupons.calc_discounts_sequentially,
        currencyDisplay: settings.currency.display,
        currencyPosition: settings.currency.position,
        thousandSep: settings.currency.thousand_sep,
        decimalSep: settings.currency.decimal_sep,
        numDecimals: settings.currency.num_decimals,
    };
}

/** Map the form back to the PATCH payload (server no-ops unchanged keys). */
export function toUpdate(values: GeneralForm): AdminGeneralSettingsUpdate {
    return {
        store_address: {
            address_1: values.storeAddress1,
            address_2: values.storeAddress2,
            city: values.storeCity,
            state: values.storeState,
            postcode: values.storePostcode,
            country: values.country,
        },
        general_options: {
            selling_locations: values.sellingLocations,
            shipping_locations: values.shippingLocations,
            default_customer_location: values.defaultCustomerLocation,
            address_autocomplete: values.addressAutocomplete,
        },
        taxes_and_coupons: {
            taxes_enabled: values.taxesEnabled,
            coupons_enabled: values.couponsEnabled,
            calc_discounts_sequentially: values.calcDiscountsSequentially,
        },
        currency: {
            display: values.currencyDisplay,
            position: values.currencyPosition,
            thousand_sep: values.thousandSep,
            decimal_sep: values.decimalSep,
            num_decimals: values.numDecimals,
        },
    };
}

/** Build a live preview formatter config from the in-flight form + the chosen currency row. */
export function previewConfig(values: GeneralForm, currencies: AdminGeneralSettings["options"]["currencies"]): MoneyFormatConfig {
    const row = currencies.find((c) => c.code === values.currencyDisplay);
    return {
        symbol: row?.symbol ?? "",
        position: values.currencyPosition,
        thousandSep: values.thousandSep,
        decimalSep: values.decimalSep,
        decimals: values.numDecimals,
        baseRatio: row?.base_ratio && row.base_ratio > 0 ? row.base_ratio : 1,
    };
}
