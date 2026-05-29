import { BaseSeeder } from "@adonisjs/lucid/seeders";

import Currency from "#models/currency";

interface CurrencyRow {
    code: string;
    symbol: string;
    nameEn: string;
    nameFa: string;
    decimals: number;
    position: string;
    baseRatio: number;
    enabled: boolean;
    ordering: number;
}

/**
 * Seeds the supported-currency reference set. The Iranian Rial family is enabled (Toman is the
 * primary display currency); a handful of foreign currencies ship disabled to prove the model
 * extends without a migration. `baseRatio` is the count of stored-base (Rial) minor units per one
 * major unit — only meaningful for the Rial family, so disabled rows carry `0`.
 *
 * Idempotent via `updateOrCreateMany(["code"], …)` so a second run produces the same rows.
 */
export default class CurrenciesSeeder extends BaseSeeder {
    async run() {
        await Currency.updateOrCreateMany("code", CURRENCIES, { client: this.client });
    }
}

const CURRENCIES: CurrencyRow[] = [
    { code: "IRT", symbol: "تومان", nameEn: "Iranian toman", nameFa: "تومان", decimals: 0, position: "right_space", baseRatio: 10, enabled: true, ordering: 1 },
    { code: "IRR", symbol: "ریال", nameEn: "Iranian rial", nameFa: "ریال", decimals: 0, position: "right_space", baseRatio: 1, enabled: true, ordering: 2 },
    { code: "IRHT", symbol: "هزار تومان", nameEn: "Iranian thousand tomans", nameFa: "هزار تومان", decimals: 0, position: "right_space", baseRatio: 10000, enabled: true, ordering: 3 },
    { code: "IRHR", symbol: "هزار ریال", nameEn: "Iranian thousand rials", nameFa: "هزار ریال", decimals: 0, position: "right_space", baseRatio: 1000, enabled: true, ordering: 4 },
    { code: "USD", symbol: "$", nameEn: "US dollar", nameFa: "دلار آمریکا", decimals: 2, position: "left", baseRatio: 0, enabled: false, ordering: 10 },
    { code: "EUR", symbol: "€", nameEn: "Euro", nameFa: "یورو", decimals: 2, position: "left", baseRatio: 0, enabled: false, ordering: 11 },
    { code: "AED", symbol: "د.إ", nameEn: "UAE dirham", nameFa: "درهم امارات", decimals: 2, position: "left_space", baseRatio: 0, enabled: false, ordering: 12 },
    { code: "AFN", symbol: "؋", nameEn: "Afghan afghani", nameFa: "افغانی", decimals: 2, position: "left", baseRatio: 0, enabled: false, ordering: 13 },
    { code: "TRY", symbol: "₺", nameEn: "Turkish lira", nameFa: "لیر ترکیه", decimals: 2, position: "left", baseRatio: 0, enabled: false, ordering: 14 },
];
