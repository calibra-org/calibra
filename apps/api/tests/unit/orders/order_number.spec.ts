import { test } from "@japa/runner";

import { orderNumberService } from "#services/order_number_service";
import { resetPhase05 } from "#tests/helpers/orders";

test.group("order_number_service.allocate", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("two sequential allocations are monotonic", async ({ assert }) => {
        const a = await orderNumberService.allocate();
        const b = await orderNumberService.allocate();
        assert.isAbove(b, a);
    });

    test("concurrent allocations never collide", async ({ assert }) => {
        const results = await Promise.all([
            orderNumberService.allocate(),
            orderNumberService.allocate(),
            orderNumberService.allocate(),
            orderNumberService.allocate(),
            orderNumberService.allocate(),
            orderNumberService.allocate(),
            orderNumberService.allocate(),
            orderNumberService.allocate(),
        ]);
        const unique = new Set(results);
        assert.equal(unique.size, results.length);
    });
});
