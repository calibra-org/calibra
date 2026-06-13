import { AsyncLocalStorage } from "node:async_hooks";
import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

/** The token-ability prefix that marks a session as an operator impersonation. */
const IMPERSONATED_BY_PREFIX = "impersonated_by:";

/**
 * Request-scoped store of the active impersonator id. Populated once per admin request (in
 * `admin_middleware`) so the audit writer + the Bouncer denylist can read it without threading ctx
 * or re-parsing token abilities through every call site.
 */
const impersonatorStore = new AsyncLocalStorage<bigint | null>();

/** Run `fn` with the active impersonator id available to {@link currentStoredImpersonatorId}. */
export function runWithImpersonator<T>(impersonatorId: bigint | null, fn: () => T): T {
    return impersonatorStore.run(impersonatorId, fn);
}

/** The impersonator id for the current request, from the request-scoped store (null if none / unset). */
export function currentStoredImpersonatorId(): bigint | null {
    return impersonatorStore.getStore() ?? null;
}

/**
 * Throw a 403 when the current request is an impersonated session. The denylist guard for high-blast
 * actions an operator must never take while impersonating (operator management, ownership transfer,
 * owner-credential rotation, shop deletion, full-PII export, destructive bulk ops).
 */
export function assertNotImpersonating(): void {
    if (currentStoredImpersonatorId() !== null) {
        throw new Exception("This action is unavailable during impersonation", {
            status: 403,
            code: "E_ACTION_UNAVAILABLE_DURING_IMPERSONATION",
        });
    }
}

/** Parse the impersonating platform-user id from a token's abilities, or null for a normal session. */
export function parseImpersonatedBy(abilities: readonly string[] | undefined): bigint | null {
    const found = abilities?.find((ability) => ability.startsWith(IMPERSONATED_BY_PREFIX));
    if (!found) return null;
    const raw = found.slice(IMPERSONATED_BY_PREFIX.length);
    try {
        return BigInt(raw);
    } catch {
        return null;
    }
}

/**
 * The platform operator impersonating the current request, or null. Reads the
 * `impersonated_by:<platformUserId>` ability off the authenticated user's current access token —
 * the single source of truth for "is this an impersonated session and who is driving it". Consumed
 * by the forced-password-change bypass, `/auth/me`, the audit writer, and the Bouncer denylist so
 * none of them re-parse the abilities independently.
 */
export function currentImpersonatorId(ctx: HttpContext): bigint | null {
    const user = ctx.auth?.user as { currentAccessToken?: { abilities?: string[] } } | undefined;
    return parseImpersonatedBy(user?.currentAccessToken?.abilities);
}
