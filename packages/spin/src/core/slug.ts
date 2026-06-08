/**
 * Slug rules and the compose-project naming that is calibra's sole sandbox-isolation
 * primitive. A slug is lowercase kebab-case, 3–40 chars, starts with a letter and ends with
 * an alphanumeric — safely inside Docker Compose's project-name constraints, since the
 * project name is `calibra-spin-<slug>`.
 */

const SLUG_RE = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;

/**
 * The in-place spin slug. `spin local` runs the full stack against the current checkout (no
 * worktree, no PR). It is reserved for the `start`/`stop` slug argument — operators reach it
 * through the dedicated `local` command — so it never collides with a worktree spin.
 */
export const LOCAL_SLUG = "local";

/** Names that cannot be used as a worktree slug. */
const RESERVED = new Set(["spin", "default", "all", "none", "test", LOCAL_SLUG]);

export type SlugError = "invalid-format" | "reserved-name";

export type SlugResult = { ok: true } | { ok: false; reason: SlugError };

/** Validate a slug as a tagged union so callers can branch on the precise failure. */
export function validateSlug(slug: string): SlugResult {
    if (!SLUG_RE.test(slug)) return { ok: false, reason: "invalid-format" };
    if (RESERVED.has(slug)) return { ok: false, reason: "reserved-name" };
    return { ok: true };
}

/** Throw a human-actionable error when {@link validateSlug} rejects. */
export function assertSlug(slug: string): void {
    const result = validateSlug(slug);
    if (result.ok) return;
    if (result.reason === "invalid-format") {
        throw new Error(
            `invalid slug "${slug}" — must match ${SLUG_RE.source} (start with a letter, end alphanumeric, 3–40 chars)`,
        );
    }
    throw new Error(`reserved slug "${slug}" — pick a different name`);
}

/** The docker-compose project name for a slug — the per-spin container/network namespace. */
export function composeProjectName(slug: string): string {
    return `calibra-spin-${slug}`;
}
