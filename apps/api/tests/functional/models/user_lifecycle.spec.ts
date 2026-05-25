import { test } from "@japa/runner";

import User from "#models/user";
import { truncatePhase03Tables } from "#tests/helpers/db";

test.group("User lifecycle hooks", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("@beforeSave lowercases the email on insert", async ({ assert }) => {
        const user = await User.create({
            email: "Mixed.Case@CALIBRA.dev",
            passwordHash: "Passw0rd1!",
            role: "customer",
            locale: "fa",
        });
        assert.equal(user.email, "mixed.case@calibra.dev");
    });

    test("@beforeSave lowercases the email on update", async ({ assert }) => {
        const user = await User.create({
            email: "lower@calibra.dev",
            passwordHash: "Passw0rd1!",
            role: "customer",
            locale: "fa",
        });
        user.email = "UPPER@CALIBRA.dev";
        await user.save();
        assert.equal(user.email, "upper@calibra.dev");
    });
});
