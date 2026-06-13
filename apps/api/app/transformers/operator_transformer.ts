import type { DateTime } from "luxon";

import type { OperatorCapabilities } from "#policies/operator_capabilities";

/** The operator fields the transformer reads — structural so both `User` and query rows satisfy it. */
interface OperatorRow {
    id: bigint | number;
    email: string | null;
    phone: string | null;
    role: string;
    disabledAt: DateTime | null;
    lastLoginAt: DateTime | null;
    createdAt: DateTime;
}

/** Operator status, derived from the credential lifecycle columns. */
function operatorStatus(user: OperatorRow): "active" | "disabled" | "never_signed_in" {
    if (user.disabledAt !== null) return "disabled";
    if (user.lastLoginAt === null) return "never_signed_in";
    return "active";
}

/** Display name for an operator — users carry no name column, so derive from the email local part. */
function displayName(user: OperatorRow): string {
    if (user.email) return String(user.email).split("@")[0];
    if (user.phone) return String(user.phone);
    return `user-${user.id}`;
}

/**
 * The shared operator wire shape (`Operator` in the OpenAPI surface). Emitted identically by the
 * platform console and the admin Team page so both render one envelope. `capabilities` is computed
 * server-side per caller (see {@link computeOperatorCapabilities}) and drives the row actions.
 */
export function toOperator(user: OperatorRow, opts: { isStoreOwner: boolean; capabilities: OperatorCapabilities }) {
    return {
        id: Number(user.id),
        name: displayName(user),
        email: user.email ? String(user.email) : null,
        role: user.role,
        is_store_owner: opts.isStoreOwner,
        status: operatorStatus(user),
        last_login_at: user.lastLoginAt?.toISO() ?? null,
        created_at: user.createdAt?.toISO() ?? null,
        capabilities: opts.capabilities,
    };
}
