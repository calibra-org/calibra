/**
 * Locale codes the slugifier knows about. `en` runs the standard ASCII pipeline; `fa` (and any
 * other locale today) preserves Persian/Arabic letters and only collapses whitespace +
 * punctuation. Add additional locales here as the catalog gains them.
 */
export type SlugLocale = "fa" | "en";

/**
 * Range that covers Persian + Arabic letters, the Persian-only `پ چ ژ گ`, the alef/ye variants,
 * the diacritics, and Eastern Arabic digits (U+0660–U+0669, U+06F0–U+06F9). Anything outside this
 * range is treated as a separator.
 */
const PERSIAN_LETTER_OR_DIGIT = /[ء-ٰٟ-ە۰-۹]/u;
const ASCII_LETTER_OR_DIGIT = /[a-zA-Z0-9]/;

/**
 * Slugify a human-readable title into a URL-safe slug.
 *
 * - `en`: lowercase, ASCII letters/digits/hyphen only, collapsed separators, trimmed dashes.
 * - `fa` (and other non-en): preserves Persian letters, collapses whitespace + punctuation into a
 *   single `-`, trims leading/trailing dashes. Persian digits and diacritics survive intact.
 *
 * Never emits the WooCommerce `pa_` prefix on attribute slugs — that prefix is a WordPress
 * taxonomy-registry leak we don't want (per ADR D25).
 *
 * Throws if the result is empty (input was only whitespace/punctuation).
 */
export function slugify(input: string, locale: SlugLocale = "en"): string {
    if (typeof input !== "string") {
        throw new TypeError("slugify expects a string input");
    }

    const trimmed = input.trim();
    if (trimmed.length === 0) {
        throw new RangeError("slugify input cannot be empty");
    }

    const slug = locale === "fa" ? slugifyPersian(trimmed) : slugifyAscii(trimmed);

    if (slug.length === 0) {
        throw new RangeError(`slugify produced an empty result for input "${input}"`);
    }
    return slug;
}

function slugifyAscii(input: string): string {
    return input
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function slugifyPersian(input: string): string {
    const out: string[] = [];
    let lastWasSeparator = false;

    for (const char of input) {
        if (PERSIAN_LETTER_OR_DIGIT.test(char) || ASCII_LETTER_OR_DIGIT.test(char)) {
            out.push(char.toLowerCase());
            lastWasSeparator = false;
            continue;
        }

        if (lastWasSeparator) continue;
        out.push("-");
        lastWasSeparator = true;
    }

    return out.join("").replace(/^-+|-+$/g, "");
}
