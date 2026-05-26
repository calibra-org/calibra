import { test } from "@japa/runner";

import { normalizeIranText } from "#services/iran_text_normalize";

test.group("normalizeIranText", () => {
    test("treats trailing whitespace and identical input as equal", ({ assert }) => {
        assert.equal(normalizeIranText("تهران"), normalizeIranText("تهران "));
    });

    test("does NOT collapse different words (sanity)", ({ assert }) => {
        assert.notEqual(normalizeIranText("تهران"), normalizeIranText("طهران"));
    });

    test("folds Arabic Yeh (U+064A) onto Persian Yeh (U+06CC)", ({ assert }) => {
        assert.equal(normalizeIranText("ري"), normalizeIranText("ری"));
    });

    test("folds Arabic Kaf (U+0643) onto Persian Kaf (U+06A9)", ({ assert }) => {
        assert.equal(normalizeIranText("كرج"), normalizeIranText("کرج"));
    });

    test("strips zero-width non-joiner (U+200C)", ({ assert }) => {
        assert.equal(normalizeIranText("اصفهان‌"), normalizeIranText("اصفهان"));
    });

    test("strips the leading 'شهر ' descriptor prefix", ({ assert }) => {
        assert.equal(normalizeIranText("شهر تهران"), normalizeIranText("تهران"));
    });

    test("strips the leading 'شهرستان ' descriptor prefix", ({ assert }) => {
        assert.equal(normalizeIranText("شهرستان کرج"), normalizeIranText("کرج"));
    });

    test("strips the leading 'city of ' descriptor prefix", ({ assert }) => {
        assert.equal(normalizeIranText("City of Tehran"), normalizeIranText("tehran"));
    });

    test("lowercases Latin transliterations", ({ assert }) => {
        assert.equal(normalizeIranText("Tehran"), normalizeIranText("tehran"));
        assert.equal(normalizeIranText("TEHRAN"), normalizeIranText("tehran"));
    });

    test("strips the tatweel (U+0640)", ({ assert }) => {
        assert.equal(normalizeIranText("بـندر عـباس"), normalizeIranText("بندر عباس"));
    });

    test("strips Arabic/Persian diacritics (U+064B–U+065F, U+0670)", ({ assert }) => {
        assert.equal(normalizeIranText("بَندَر عَباس"), normalizeIranText("بندر عباس"));
    });

    test("returns the empty string for null, undefined, and blank input", ({ assert }) => {
        assert.equal(normalizeIranText(null), "");
        assert.equal(normalizeIranText(undefined), "");
        assert.equal(normalizeIranText(""), "");
        assert.equal(normalizeIranText("   "), "");
    });

    test("collapses internal whitespace", ({ assert }) => {
        assert.equal(normalizeIranText("بندر   عباس"), normalizeIranText("بندر عباس"));
    });

    test("strips wrapping punctuation", ({ assert }) => {
        assert.equal(normalizeIranText(",تهران."), normalizeIranText("تهران"));
        assert.equal(normalizeIranText("(تهران)"), normalizeIranText("تهران"));
        assert.equal(normalizeIranText("'tehran'"), normalizeIranText("tehran"));
    });
});
