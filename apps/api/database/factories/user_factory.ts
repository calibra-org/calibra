import factory from "@adonisjs/lucid/factories";

import User from "#models/user";
import { testTenantId } from "#tests/helpers/tenant";

let counter = 0;

export const UserFactory = factory
    .define(User, async () => {
        counter += 1;
        return {
            tenantId: await testTenantId(),
            email: `user_${Date.now()}_${counter}@example.test`,
            passwordHash: "Passw0rd!",
            locale: "fa" as const,
            role: "customer" as const,
        };
    })
    .state("admin", (user) => {
        user.role = "admin";
    })
    .build();
