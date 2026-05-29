import { test } from "@japa/runner";

import { baseMinorToMajor, formatMoney, type MoneyFormatConfig, parseMajorToBaseMinor } from "#services/money";

/** Non-breaking space — formatMoney puts it between number and symbol (matches WC `&nbsp;`). */
const SP = "\u00a0";

const TOMAN: MoneyFormatConfig = {
    symbol: "تومان",
    position: "right_space",
    thousandSep: "٬",
    decimalSep: ".",
    decimals: 0,
    baseRatio: 10,
};
const RIAL: MoneyFormatConfig = {
    symbol: "ریال",
    position: "right_space",
    thousandSep: "٬",
    decimalSep: ".",
    decimals: 0,
    baseRatio: 1,
};
const CENTS: MoneyFormatConfig = {
    symbol: "$",
    position: "left",
    thousandSep: ",",
    decimalSep: ".",
    decimals: 2,
    baseRatio: 100,
};

test.group("money / formatMoney — display currency + ratio", () => {
    test("Toman divides BASE Rial by base_ratio (10), 0 decimals", ({ assert }) => {
        assert.equal(formatMoney(1_250_000, TOMAN, { locale: "en" }), `125٬000${SP}تومان`);
    });

    test("Rial renders raw BASE units (ratio 1)", ({ assert }) => {
        assert.equal(formatMoney(1_250_000, RIAL, { locale: "en" }), `1٬250٬000${SP}ریال`);
    });

    test("Persian locale renders Persian digits; separator stays config-driven", ({ assert }) => {
        assert.equal(formatMoney(1_250_000, TOMAN, { locale: "fa" }), `۱۲۵٬۰۰۰${SP}تومان`);
    });

    test("zero renders cleanly", ({ assert }) => {
        assert.equal(formatMoney(0, TOMAN, { locale: "fa" }), `۰${SP}تومان`);
    });

    test("withSymbol:false returns the number only", ({ assert }) => {
        assert.equal(formatMoney(1_250_000, TOMAN, { locale: "en", withSymbol: false }), "125٬000");
    });
});

test.group("money / formatMoney — separators + decimals", () => {
    test("two-decimal currency emits the decimal separator", ({ assert }) => {
        assert.equal(formatMoney(123_456, CENTS, { locale: "en" }), "$1,234.56");
    });

    test("rounds to the configured decimals", ({ assert }) => {
        assert.equal(formatMoney(125, TOMAN, { locale: "en", withSymbol: false }), "13");
    });

    test("custom thousand separator is honored", ({ assert }) => {
        const cfg: MoneyFormatConfig = { ...TOMAN, thousandSep: "," };
        assert.equal(formatMoney(12_345_670, cfg, { locale: "en", withSymbol: false }), "1,234,567");
    });
});

test.group("money / formatMoney — symbol position", () => {
    const n = 1_250_000;
    test("left", ({ assert }) => assert.equal(formatMoney(n, { ...TOMAN, position: "left" }, { locale: "en" }), "تومان125٬000"));
    test("right", ({ assert }) =>
        assert.equal(formatMoney(n, { ...TOMAN, position: "right" }, { locale: "en" }), "125٬000تومان"));
    test("left_space", ({ assert }) =>
        assert.equal(formatMoney(n, { ...TOMAN, position: "left_space" }, { locale: "en" }), `تومان${SP}125٬000`));
    test("right_space", ({ assert }) =>
        assert.equal(formatMoney(n, { ...TOMAN, position: "right_space" }, { locale: "en" }), `125٬000${SP}تومان`));
});

test.group("money / convert — round-trip", () => {
    test("parseMajorToBaseMinor multiplies by base_ratio", ({ assert }) => {
        assert.equal(parseMajorToBaseMinor(125_000, TOMAN), 1_250_000);
        assert.equal(parseMajorToBaseMinor(1_250_000, RIAL), 1_250_000);
    });

    test("baseMinorToMajor divides by base_ratio", ({ assert }) => {
        assert.equal(baseMinorToMajor(1_250_000, TOMAN), 125_000);
        assert.equal(baseMinorToMajor(1_250_000, RIAL), 1_250_000);
    });

    test("major → base minor → major is stable for Toman-aligned amounts", ({ assert }) => {
        const major = 84_500;
        assert.equal(baseMinorToMajor(parseMajorToBaseMinor(major, TOMAN), TOMAN), major);
    });
});
