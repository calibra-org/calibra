import type { OrderStatus } from "#/lib/types";

/**
 * Allowed `(from, to)` transitions, mirroring `apps/api/app/enums/order_status.ts` ORDER_TRANSITIONS.
 * Kept duplicated client-side so the status dropdown can grey out illegal targets without a network
 * round-trip. The api remains authoritative — illegal POSTs still 422 — so drift between the two
 * shows up as a UX regression (greyed when it shouldn't be) rather than data corruption.
 */
const TRANSITION_TABLE: Record<OrderStatus, OrderStatus[]> = {
    draft: ["pending", "cancelled"],
    pending: ["on_hold", "processing", "failed", "cancelled"],
    on_hold: ["processing", "cancelled", "failed"],
    processing: ["completed", "cancelled", "refunded"],
    completed: ["refunded"],
    failed: ["pending"],
    cancelled: [],
    refunded: [],
};

/** Returns the set of statuses an operator can move the given order to. Excludes `to === from`. */
export function legalNextStatuses(current: OrderStatus): OrderStatus[] {
    return TRANSITION_TABLE[current] ?? [];
}

/** True when the operator can shift from `from` to `to` via the state machine. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return TRANSITION_TABLE[from]?.includes(to) ?? false;
}
