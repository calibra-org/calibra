import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";

import Setting from "#models/setting";
import SettingsService from "#services/settings_service";

test.group("SettingsService", (group) => {
    group.each.setup(() => testUtils.db().truncate());

    test("get returns the fallback when no row exists", async ({ assert }) => {
        const service = new SettingsService();
        const value = await service.get<string>("general", "nonexistent", "default-value");
        assert.equal(value, "default-value");
    });

    test("set then get round-trips a string value", async ({ assert }) => {
        const service = new SettingsService();
        await service.set("general", "currency", "IRR", "string");
        const value = await service.get<string>("general", "currency", "USD");
        assert.equal(value, "IRR");
    });

    test("set then get round-trips a number value", async ({ assert }) => {
        const service = new SettingsService();
        await service.set("inventory", "hold_stock_minutes", 60, "number");
        const value = await service.get<number>("inventory", "hold_stock_minutes", 0);
        assert.equal(value, 60);
    });

    test("set then get round-trips a boolean value", async ({ assert }) => {
        const service = new SettingsService();
        await service.set("tax", "prices_include_tax", true, "boolean");
        const value = await service.get<boolean>("tax", "prices_include_tax", false);
        assert.equal(value, true);
    });

    test("set then get round-trips a json value", async ({ assert }) => {
        const service = new SettingsService();
        const payload: { themes: string[]; featureFlags: { abTest: number } } = {
            themes: ["light", "dark"],
            featureFlags: { abTest: 7 },
        };
        await service.set("ui", "preferences", payload, "json");
        const fallback = { themes: [], featureFlags: { abTest: 0 } };
        const value = await service.get<typeof payload>("ui", "preferences", fallback);
        assert.deepEqual(value, payload);
    });

    test("get memoizes the read so a side-effect-only DB change is not seen", async ({ assert }) => {
        const service = new SettingsService();
        await service.set("general", "country_default", "IR", "string");
        assert.equal(await service.get<string>("general", "country_default", ""), "IR");

        await Setting.query()
            .where("group_key", "general")
            .where("key", "country_default")
            .update({ value: JSON.stringify("XX") });

        assert.equal(await service.get<string>("general", "country_default", ""), "IR");
    });

    test("set invalidates the memoized cache for the key it touched", async ({ assert }) => {
        const service = new SettingsService();
        await service.set("general", "country_default", "IR", "string");
        assert.equal(await service.get<string>("general", "country_default", ""), "IR");

        await service.set("general", "country_default", "US", "string");
        assert.equal(await service.get<string>("general", "country_default", ""), "US");
    });

    test("all returns only the requested group's keys", async ({ assert }) => {
        const service = new SettingsService();
        await service.set("general", "currency", "IRR", "string");
        await service.set("general", "country_default", "IR", "string");
        await service.set("inventory", "hold_stock_minutes", 60, "number");

        const generalGroup = await service.all("general");

        assert.deepEqual(Object.keys(generalGroup).sort(), ["country_default", "currency"]);
        assert.equal(generalGroup.currency, "IRR");
        assert.equal(generalGroup.country_default, "IR");
        assert.isUndefined(generalGroup.hold_stock_minutes);
    });

    test("set invalidates the cached group snapshot", async ({ assert }) => {
        const service = new SettingsService();
        await service.set("general", "currency", "IRR", "string");

        const first = await service.all("general");
        assert.deepEqual(first, { currency: "IRR" });

        await service.set("general", "country_default", "IR", "string");

        const second = await service.all("general");
        assert.deepEqual(second, { currency: "IRR", country_default: "IR" });
    });
});
