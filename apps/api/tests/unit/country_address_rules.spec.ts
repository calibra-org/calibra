import { test } from "@japa/runner";

import { defaultRules } from "#services/country_address_rules/default";
import { ir } from "#services/country_address_rules/ir";
import { rulesFor } from "#services/country_address_rules/index";

test.group("country_address_rules.rulesFor", () => {
    test("returns the Iran ruleset for IR", ({ assert }) => {
        const rules = rulesFor("IR");
        assert.strictEqual(rules, ir);
        assert.isTrue(rules.requiresRegion);
        assert.deepEqual(rules.postcodePattern, /^\d{10}$/);
        assert.isFunction(rules.extensionValidator);
        assert.include(rules.requiredFields, "region_id");
    });

    test("returns the default ruleset for an uncovered country (US)", ({ assert }) => {
        const rules = rulesFor("US");
        assert.strictEqual(rules, defaultRules);
        assert.isFalse(rules.requiresRegion);
        assert.isNull(rules.postcodePattern);
    });

    test("returns the default ruleset for an unknown country (ZZ)", ({ assert }) => {
        const rules = rulesFor("ZZ");
        assert.strictEqual(rules, defaultRules);
    });

    test("returns the default ruleset for malformed input", ({ assert }) => {
        assert.strictEqual(rulesFor(""), defaultRules);
        assert.strictEqual(rulesFor("IRAN"), defaultRules);
    });

    test("default rules cover the universal minimum required fields", ({ assert }) => {
        for (const field of ["first_name", "last_name", "address_line_1", "city", "country"] as const) {
            assert.include(defaultRules.requiredFields, field);
        }
    });

    test("Iran extension validator accepts a valid national_id", async ({ assert }) => {
        const result = await ir.extensionValidator!({ national_id: "1234567891" });
        assert.deepEqual(result, { ok: true });
    });

    test("Iran extension validator rejects an invalid national_id checksum", async ({ assert }) => {
        const result = await ir.extensionValidator!({ national_id: "1234567890" });
        assert.deepEqual(result, { ok: false, field: "iran_extension.national_id", reason: "checksum" });
    });

    test("Iran extension validator skips checks when no extension is present", async ({ assert }) => {
        const result = await ir.extensionValidator!(null);
        assert.deepEqual(result, { ok: true });
    });
});
