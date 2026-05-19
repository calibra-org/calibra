/**
 * Order status. The Postgres `order_status_enum` mirrors these values exactly — adding a new
 * status is a `CREATE TYPE … ADD VALUE` migration AND a TS enum-member addition; the two stay in
 * lockstep. {@link OrderStateMachine} gates every transition; controllers never poke
 * `order.status` directly.
 */
export enum OrderStatus {
    Draft = "draft",
    Pending = "pending",
    OnHold = "on_hold",
    Processing = "processing",
    Completed = "completed",
    Cancelled = "cancelled",
    Refunded = "refunded",
    Failed = "failed",
}

export const ORDER_STATUS_VALUES = [
    OrderStatus.Draft,
    OrderStatus.Pending,
    OrderStatus.OnHold,
    OrderStatus.Processing,
    OrderStatus.Completed,
    OrderStatus.Cancelled,
    OrderStatus.Refunded,
    OrderStatus.Failed,
] as const;

export function isOrderStatus(value: unknown): value is OrderStatus {
    return typeof value === "string" && (ORDER_STATUS_VALUES as readonly string[]).includes(value);
}

/**
 * Per-trigger side effects {@link OrderStateMachine.transition} runs after a successful
 * transition. The map below is the authoritative transition table — controllers reach the state
 * machine through {@link findTransition}, never by editing this list at the call-site.
 */
export type OrderTransitionEffect = "reserve_stock" | "restore_stock" | "set_paid_at" | "set_completed_at" | "grant_downloads";

export interface OrderTransition {
    from: OrderStatus;
    to: OrderStatus;
    effects: ReadonlyArray<OrderTransitionEffect>;
}

export const ORDER_TRANSITIONS: ReadonlyArray<OrderTransition> = [
    /** draft → pending: stock reservation, order_number allocation, OrderPlaced event. */
    { from: OrderStatus.Draft, to: OrderStatus.Pending, effects: ["reserve_stock"] },
    /** draft → cancelled: idle timeout. No stock change (none was reserved yet). */
    { from: OrderStatus.Draft, to: OrderStatus.Cancelled, effects: [] },
    /** pending → on_hold: manual gateway / async pending. */
    { from: OrderStatus.Pending, to: OrderStatus.OnHold, effects: [] },
    /** pending → processing: PSP callback confirms payment success — stamps `date_paid_at`. */
    { from: OrderStatus.Pending, to: OrderStatus.Processing, effects: ["set_paid_at"] },
    /** pending → failed: payment declined. Stock stays reserved until ops cancels. */
    { from: OrderStatus.Pending, to: OrderStatus.Failed, effects: [] },
    /** pending → cancelled: customer/admin cancel OR inventory-hold timeout. Restores stock. */
    { from: OrderStatus.Pending, to: OrderStatus.Cancelled, effects: ["restore_stock"] },
    /** on_hold → processing: admin marks paid OR async confirm. */
    { from: OrderStatus.OnHold, to: OrderStatus.Processing, effects: ["set_paid_at"] },
    /** on_hold → cancelled: admin/customer. Restores stock. */
    { from: OrderStatus.OnHold, to: OrderStatus.Cancelled, effects: ["restore_stock"] },
    /** on_hold → failed: async negative. */
    { from: OrderStatus.OnHold, to: OrderStatus.Failed, effects: [] },
    /**
     * processing → completed: ship physical orders, auto-complete for virtual / downloadable.
     * Stamps the completion timestamp and runs `grant_downloads`, which is a no-op today but is
     * the hook for materialising `customer_downloads` rows for downloadable line items.
     */
    {
        from: OrderStatus.Processing,
        to: OrderStatus.Completed,
        effects: ["set_completed_at", "grant_downloads"],
    },
    /** processing → cancelled: admin. Restores stock. */
    { from: OrderStatus.Processing, to: OrderStatus.Cancelled, effects: ["restore_stock"] },
    /** processing → refunded: a refund whose cumulative amount equals `orders.grand_total`. */
    { from: OrderStatus.Processing, to: OrderStatus.Refunded, effects: [] },
    /** completed → refunded: full refund. */
    { from: OrderStatus.Completed, to: OrderStatus.Refunded, effects: [] },
    /** failed → pending: customer retries via the pay-link. Re-reserves stock. */
    { from: OrderStatus.Failed, to: OrderStatus.Pending, effects: ["reserve_stock"] },
];

/** Map lookup: `(from, to)` → effects, or `null` for illegal transitions. */
export function findTransition(from: OrderStatus, to: OrderStatus): OrderTransition | null {
    return ORDER_TRANSITIONS.find((row) => row.from === from && row.to === to) ?? null;
}
