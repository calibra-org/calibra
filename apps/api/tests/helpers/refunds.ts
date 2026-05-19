import db from "@adonisjs/lucid/services/db";

import { OrderStatus } from "#enums/order_status";
import type Order from "#models/order";
import { orderStateMachine } from "#services/order_state_machine";
import { resetPhase05 } from "#tests/helpers/orders";

/**
 * Truncate the phase-07 tables on top of the phase-05 reset. `resetWithPhase07()` is the standard
 * `group.each.setup()` for refund/notes tests — gives a clean order space AND a clean refund space.
 */
export async function truncatePhase07Tables(): Promise<void> {
    const tables = ["order_refund_line_items", "order_refunds", "order_notes"];
    await db.rawQuery(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
    await db.rawQuery("ALTER SEQUENCE refund_number_seq RESTART WITH 1000");
}

export async function resetWithPhase07(): Promise<void> {
    await resetPhase05();
    await truncatePhase07Tables();
}

/**
 * Promote a draft order through the legal transition chain into the requested terminal status, so
 * refund-flow tests can start from a realistic state without re-running the full checkout. Pass
 * `Processing` for a partially-fulfilled order; `Completed` for a fully-fulfilled one.
 */
export async function advanceOrderTo(order: Order, status: OrderStatus): Promise<void> {
    if (order.status === OrderStatus.Draft) {
        await orderStateMachine.transition(order, OrderStatus.Pending, { reason: "test:advance" });
    }
    if (status === OrderStatus.Pending) return;

    await orderStateMachine.transition(order, OrderStatus.Processing, { reason: "test:advance" });
    if (status === OrderStatus.Processing) return;

    if (status === OrderStatus.Completed) {
        await orderStateMachine.transition(order, OrderStatus.Completed, { reason: "test:advance" });
        return;
    }
    throw new Error(`advanceOrderTo: unsupported target ${status}`);
}
