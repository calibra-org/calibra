import type { HttpContext } from "@adonisjs/core/http";

/** The token-ability prefix that marks a session as an operator impersonation. */
const IMPERSONATED_BY_PREFIX = "impersonated_by:";

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
