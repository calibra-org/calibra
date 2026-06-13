/**
 * Server-computed operator capabilities — the single source of truth both the platform console and
 * the admin Team page render their row actions from. Never trust the client: the same function runs
 * for both surfaces so the buttons a user sees always match what the API will actually allow.
 *
 * Caller context matters. A **platform** operator can manage every operator; a **tenant admin** can
 * only manage operators when they are the current `store_owner` (self-service is owner-gated). The
 * `store_owner` is protected everywhere — it can never be disabled, removed, or demoted — and the
 * last active admin can never be disabled/removed (a shop must always have a way in). "Login as"
 * (impersonation) is a platform-only capability.
 */

export interface CapabilityInput {
    callerKind: "platform" | "admin";
    /** The acting tenant user id when `callerKind === 'admin'`; ignored for platform callers. */
    callerUserId?: bigint | number | null;
    operator: {
        id: bigint | number;
        role: string;
        disabledAt: unknown;
        deletedAt: unknown;
    };
    ownerUserId: bigint | number;
    /** Count of non-disabled, non-deleted admins in the tenant — gates last-admin protection. */
    activeAdminCount: number;
}

export interface OperatorCapabilities {
    can_login_as: boolean;
    can_reset_password: boolean;
    can_disable: boolean;
    can_enable: boolean;
    can_remove: boolean;
    can_make_owner: boolean;
}

export function computeOperatorCapabilities(input: CapabilityInput): OperatorCapabilities {
    const { callerKind, callerUserId, operator, ownerUserId, activeAdminCount } = input;

    const isOwnerRow = Number(operator.id) === Number(ownerUserId);
    const isAdminRole = operator.role === "admin";
    const isDisabled = operator.disabledAt !== null && operator.disabledAt !== undefined;
    const isDeleted = operator.deletedAt !== null && operator.deletedAt !== undefined;
    const isActive = !isDisabled && !isDeleted;
    const isLastActiveAdmin = activeAdminCount <= 1;

    /** Who may mutate this operator at all: platform always; a tenant admin only if they are the owner. */
    const canManage = callerKind === "platform" || Number(callerUserId) === Number(ownerUserId);
    const isPlatform = callerKind === "platform";

    return {
        can_login_as: isPlatform && isAdminRole && isActive,
        can_reset_password: canManage && !isDeleted,
        can_disable: canManage && isActive && !isOwnerRow && !isLastActiveAdmin,
        can_enable: canManage && isDisabled && !isDeleted,
        can_remove: canManage && !isDeleted && !isOwnerRow && !isLastActiveAdmin,
        can_make_owner: canManage && isActive && isAdminRole && !isOwnerRow,
    };
}
