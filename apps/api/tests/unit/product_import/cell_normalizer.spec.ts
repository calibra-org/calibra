import { test } from "@japa/runner";

import {
    parseDateLoose,
    parseLooseBoolean,
    parseLooseNumber,
    stripCurrencySymbols,
    stripThousandSeparators,
    toEnglishDigits,
} from "#services/product_import/cell_normalizer";

test.group("product_import / cell_normalizer / digits", () => {
    test("converts Persian digits to ASCII", ({ assert }) => {
        assert.equal(toEnglishDigits("۲۹۹۰۰۰"), "299000");
        assert.equal(toEnglishDigits("سال ۱۴۰۵"), "سال 1405");
    });

    test("converts Arabic-Indic digits to ASCII", ({ assert }) => {
        assert.equal(toEnglishDigits("٠١٢٣٤٥٦٧٨٩"), "0123456789");
    });

    test("passes through non-digit characters unchanged", ({ assert }) => {
        assert.equal(toEnglishDigits("hello world"), "hello world");
        assert.equal(toEnglishDigits(""), "");
    });
});

test.group("product_import / cell_normalizer / thousand separators", () => {
    test("strips Persian thousand separator", ({ assert }) => {
        assert.equal(stripThousandSeparators("۱٬۲۹۹٬۰۰۰"), "۱۲۹۹۰۰۰");
    });

    test("strips ASCII comma separators", ({ assert }) => {
        assert.equal(stripThousandSeparators("1,299,000"), "1299000");
    });

    test("preserves separators not surrounded by digits", ({ assert }) => {
        assert.equal(stripThousandSeparators("hello, world"), "hello, world");
    });
});

test.group("product_import / cell_normalizer / currency", () => {
    test("strips Persian currency suffixes", ({ assert }) => {
        assert.equal(stripCurrencySymbols("۲۹۹٬۰۰۰ تومان").trim(), "۲۹۹٬۰۰۰");
        assert.equal(stripCurrencySymbols("۱۹۹۰۰۰ ریال").trim(), "۱۹۹۰۰۰");
    });

    test("strips ASCII currency symbols", ({ assert }) => {
        assert.equal(stripCurrencySymbols("$1234").trim(), "1234");
        assert.equal(stripCurrencySymbols("1234 EUR").trim(), "1234");
    });
});

test.group("product_import / cell_normalizer / parseLooseNumber", () => {
    test("parses Persian-digit numbers with separators and currency", ({ assert }) => {
        assert.equal(parseLooseNumber("۲۹۹٬۰۰۰ تومان"), 299000);
        assert.equal(parseLooseNumber("۱٬۲۹۹٬۰۰۰"), 1299000);
    });

    test("parses ASCII numbers with separators", ({ assert }) => {
        assert.equal(parseLooseNumber("1,299,000"), 1299000);
        assert.equal(parseLooseNumber(" 4500 "), 4500);
    });

    test("returns null for non-numeric input", ({ assert }) => {
        assert.isNull(parseLooseNumber("abc"));
        assert.isNull(parseLooseNumber(""));
        assert.isNull(parseLooseNumber(null));
    });

    test("preserves negative numbers", ({ assert }) => {
        assert.equal(parseLooseNumber("-500"), -500);
    });
});

test.group("product_import / cell_normalizer / parseLooseBoolean", () => {
    test("parses ASCII and Persian truthy values", ({ assert }) => {
        assert.isTrue(parseLooseBoolean("yes"));
        assert.isTrue(parseLooseBoolean("YES"));
        assert.isTrue(parseLooseBoolean("1"));
        assert.isTrue(parseLooseBoolean("بله"));
        assert.isTrue(parseLooseBoolean(true));
    });

    test("parses ASCII and Persian falsy values", ({ assert }) => {
        assert.isFalse(parseLooseBoolean("no"));
        assert.isFalse(parseLooseBoolean("0"));
        assert.isFalse(parseLooseBoolean("خیر"));
        assert.isFalse(parseLooseBoolean(false));
    });

    test("returns null for unrecognized values", ({ assert }) => {
        assert.isNull(parseLooseBoolean("maybe"));
        assert.isNull(parseLooseBoolean(""));
        assert.isNull(parseLooseBoolean(null));
    });
});

test.group("product_import / cell_normalizer / parseDateLoose", () => {
    test("parses ISO Gregorian dates", ({ assert }) => {
        const result = parseDateLoose("2026-05-24");
        assert.exists(result);
        assert.equal(result!.toISOString(), "2026-05-24T00:00:00.000Z");
    });

    test("parses Jalali dates with Persian digits", ({ assert }) => {
        const result = parseDateLoose("۱۴۰۵/۰۳/۰۳");
        assert.exists(result);
        assert.equal(result!.toISOString(), "2026-05-24T00:00:00.000Z");
    });

    test("parses ASCII-digit Jalali dates", ({ assert }) => {
        const result = parseDateLoose("1405/03/03");
        assert.exists(result);
        assert.equal(result!.toISOString(), "2026-05-24T00:00:00.000Z");
    });

    test("returns null for malformed input", ({ assert }) => {
        assert.isNull(parseDateLoose("not a date"));
        assert.isNull(parseDateLoose("2026-13-99"));
        assert.isNull(parseDateLoose(""));
        assert.isNull(parseDateLoose(null));
    });
});
