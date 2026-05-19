/**
 * Lifecycle states for a `payment_attempts` row. The Postgres
 * `payment_attempt_status_enum` mirrors these values exactly. Adding a value is a `CREATE TYPE
 * … ADD VALUE` migration AND a TS enum-member addition; the two must stay in lockstep.
 *
 * State flow (single-arrow transitions only):
 *   initiated → awaiting_callback → verified
 *                                ↘ failed | cancelled
 *   verified → refunded
 */
export enum PaymentAttemptStatus {
    Initiated = "initiated",
    AwaitingCallback = "awaiting_callback",
    Verified = "verified",
    Failed = "failed",
    Cancelled = "cancelled",
    Refunded = "refunded",
}

export const PAYMENT_ATTEMPT_STATUS_VALUES = [
    PaymentAttemptStatus.Initiated,
    PaymentAttemptStatus.AwaitingCallback,
    PaymentAttemptStatus.Verified,
    PaymentAttemptStatus.Failed,
    PaymentAttemptStatus.Cancelled,
    PaymentAttemptStatus.Refunded,
] as const;
