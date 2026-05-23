/**
 * Hand-rolled slug-ifier shared by every catalog taxonomy inspector (categories, tags, brands,
 * and attribute terms). Latin and Persian text go through `String#normalize` to fold
 * diacritics, then anything that isn't a letter / digit / dash becomes a dash, with run
 * collapsing and trim. We deliberately do not transliterate Persian to Latin — taxonomies often
 * live under Persian slugs in storefront URLs and that's the operator's preference, not ours.
 * The Persian-script range `[؀-ۿ]` is kept verbatim.
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

/**
 * ASCII-only variant used by the attributes inspector. The API enforces the regex
 * `/^(?!pa_)[a-z0-9][a-z0-9-]*$/` on attribute `code`, so Persian script in the name produces
 * an empty string here — the operator is expected to type the code by hand for non-Latin
 * names. Returns "" when the input has no Latin alphanumerics to derive from.
 */
export function slugifyAscii(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}
