/**
 * Hand-rolled slug-ifier. Latin and Persian text go through `String#normalize` to fold
 * diacritics, then anything that isn't a letter / digit / dash becomes a dash, with run
 * collapsing and trim. We deliberately do not transliterate Persian to Latin — tags often
 * live under Persian slugs in storefront URLs and that's the operator's preference, not
 * ours. Shared with the categories inspector behaviour so the two surfaces produce the
 * same string for the same input.
 */
export function slugify(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/[^a-z0-9؀-ۿ-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}
