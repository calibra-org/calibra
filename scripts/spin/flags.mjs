// @ts-check

/** Reserved slug for the in-place spin (`pnpm spin local`). One per machine. */
export const LOCAL_SLUG = "local";

/**
 * @param {string[]} args
 */
export function parseFlags(args) {
    return {
        withWeb: args.includes("--with-web"),
        noPr: args.includes("--no-pr"),
        purge: args.includes("--purge"),
        remove: args.includes("--remove"),
        force: args.includes("--force"),
        json: args.includes("--json"),
    };
}

/**
 * @param {string | undefined} raw
 */
export function requireSlug(raw) {
    if (!raw || !isSlug(raw)) {
        throw new Error(`expected a slug like "tags-workbench"; got "${raw ?? ""}"`);
    }
    return raw;
}

/**
 * @param {string} candidate
 */
export function isSlug(candidate) {
    return /^[a-z][a-z0-9-]{1,39}$/.test(candidate);
}
