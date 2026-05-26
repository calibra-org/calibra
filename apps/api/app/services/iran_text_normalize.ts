/**
 * Persian/Arabic text normalization for matching free-form `order_addresses.city` snapshots
 * against seeded `regions` city names. The same rule set ships in the admin app at
 * `apps/admin/src/lib/iran-text-normalize.ts` — keep both implementations byte-identical so
 * client-side polygon labels and server-side aggregation buckets agree on the same key.
 *
 * Rules (applied in order):
 *   1. Arabic Yeh `ي` (U+064A) → Persian Yeh `ی` (U+06CC).
 *   2. Arabic Kaf `ك` (U+0643) → Persian Kaf `ک` (U+06A9).
 *   3. Strip Arabic/Persian diacritics (U+064B–U+065F, U+0670).
 *   4. Strip tatweel `ـ` (U+0640).
 *   5. Replace zero-width non-joiner (U+200C) with a single space.
 *   6. Lowercase Latin characters (transliterations).
 *   7. Strip the leading "شهر " / "شهرستان " / "city of " prefix.
 *   8. Strip wrapping punctuation (quotes, commas, parens, dashes, dots).
 *   9. Collapse internal whitespace to single space, trim.
 *
 * Returns the empty string for `null`/`undefined`/blank input.
 */

const ARABIC_YEH = "ي";
const PERSIAN_YEH = "ی";
const ARABIC_KAF = "ك";
const PERSIAN_KAF = "ک";
const TATWEEL = "ـ";
const ZWNJ = "‌";

/** Arabic/Persian diacritic block U+064B–U+065F plus the standalone U+0670. */
const DIACRITICS_PATTERN = /[ً-ٰٟ]/g;

/** Leading prefixes that act as descriptors rather than the city name itself. */
const LEADING_PREFIXES = ["شهرستان ", "شهر ", "city of "];

/** Wrapping punctuation we strip from both ends of the input. */
const WRAPPING_PUNCTUATION = /^[\s"'()،.,\-:;–—]+|[\s"'()،.,\-:;–—]+$/g;

export function normalizeIranText(input: string | null | undefined): string {
    if (input === null || input === undefined) return "";

    let value = String(input);

    value = value.replaceAll(ARABIC_YEH, PERSIAN_YEH);
    value = value.replaceAll(ARABIC_KAF, PERSIAN_KAF);

    value = value.replace(DIACRITICS_PATTERN, "");

    value = value.replaceAll(TATWEEL, "");

    value = value.replaceAll(ZWNJ, " ");

    value = value.toLowerCase();

    for (const prefix of LEADING_PREFIXES) {
        if (value.startsWith(prefix)) {
            value = value.slice(prefix.length);
            break;
        }
    }

    value = value.replace(WRAPPING_PUNCTUATION, "");

    value = value.replace(/\s+/g, " ").trim();

    return value;
}
