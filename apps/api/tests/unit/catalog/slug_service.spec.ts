import { test } from "@japa/runner";

import { slugify } from "#services/slug_service";

test.group("slug_service.slugify", () => {
    test("Persian title is preserved with dashes", ({ assert }) => {
        assert.equal(slugify("گوشی موبایل سامسونگ", "fa"), "گوشی-موبایل-سامسونگ");
    });

    test("English title is lowercased and ASCII-only", ({ assert }) => {
        assert.equal(slugify("iPhone 15 Pro Max", "en"), "iphone-15-pro-max");
    });

    test("empty input throws RangeError", ({ assert }) => {
        assert.throws(() => slugify("", "en"), RangeError);
        assert.throws(() => slugify("   ", "en"), RangeError);
    });

    test("punctuation runs collapse to a single dash", ({ assert }) => {
        assert.equal(slugify("Hello, World!!! ---", "en"), "hello-world");
        assert.equal(slugify("سلام؟؟؟ دنیا!", "fa"), "سلام-دنیا");
    });

    test("leading and trailing dashes are stripped", ({ assert }) => {
        assert.equal(slugify("--abc--", "en"), "abc");
        assert.equal(slugify("???a???", "fa"), "a");
    });

    test("never produces a pa_ prefix on attribute slugs", ({ assert }) => {
        for (const input of ["color", "Color", "Pa color", "size", "رنگ", "سایز"]) {
            const result = slugify(input, input.match(/[ا-ی]/u) ? "fa" : "en");
            assert.notMatch(result, /^pa_/);
        }
    });
});
