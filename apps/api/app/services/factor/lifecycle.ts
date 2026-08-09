export const FACTOR_TYPES = ["proforma", "invoice", "credit_note"] as const;
export type FactorType = (typeof FACTOR_TYPES)[number];

export const FACTOR_STATUSES = [
    "draft",
    "sent",
    "viewed",
    "awaiting",
    "paid",
    "expired",
    "cancelled",
    "refunded",
    "credited",
] as const;
export type FactorStatus = (typeof FACTOR_STATUSES)[number];

/**
 * Only operational document states are available through the generic transition endpoint.
 * Refunded and credited are accounting outcomes and must be produced by dedicated, auditable
 * refund/credit workflows rather than a status-only button.
 */
const TRANSITIONS: Record<FactorStatus, readonly FactorStatus[]> = {
    draft: ["sent", "cancelled"],
    sent: ["viewed", "awaiting", "paid", "expired", "cancelled"],
    viewed: ["awaiting", "paid", "expired", "cancelled"],
    awaiting: ["paid", "expired", "cancelled"],
    paid: [],
    expired: [],
    cancelled: [],
    refunded: [],
    credited: [],
};

export function isFactorStatus(value: string): value is FactorStatus {
    return (FACTOR_STATUSES as readonly string[]).includes(value);
}

export function canTransitionFactor(from: FactorStatus, to: FactorStatus): boolean {
    return TRANSITIONS[from].includes(to);
}

export function isFactorImmutable(status: FactorStatus): boolean {
    return status === "paid" || status === "refunded" || status === "credited";
}
