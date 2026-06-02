import factory from "@adonisjs/lucid/factories";

import OrderNote from "#models/order_note";
import { testTenantId } from "#tests/helpers/tenant";

let counter = 0;

export const OrderNoteFactory = factory
    .define(OrderNote, async () => {
        counter += 1;
        return {
            tenantId: await testTenantId(),
            orderId: 0 as unknown as bigint,
            body: `Test note ${counter}`,
            visibility: "internal" as const,
            authorUserId: null,
            attributes: {},
        };
    })
    .state("customer", (note) => {
        note.visibility = "customer";
    })
    .build();
