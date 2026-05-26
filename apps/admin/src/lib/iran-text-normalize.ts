/**
 * Browser-side mirror of `apps/api/app/services/iran_text_normalize.ts`. Used by the regional
 * insights widget to match upstream city polygon names (when geometry is ever vendored) to the
 * seeded city names rendered in the side panel. The two implementations MUST stay byte-identical
 * — a divergence silently breaks the polygon↔seeded-city mapping.
 *
 * Rule list — keep in lockstep with the api helper:
 *   1. Arabic Yeh `ي` (U+064A) → Persian Yeh `ی` (U+06CC).
 *   2. Arabic Kaf `ك` (U+0643) → Persian Kaf `ک` (U+06A9).
 *   3. Strip Arabic/Persian diacritics (U+064B–U+065F, U+0670).
 *   4. Strip tatweel `ـ` (U+0640).
 *   5. Replace zero-width non-joiner (U+200C) with a single space.
 *   6. Lowercase Latin characters.
 *   7. Strip leading "شهر " / "شهرستان " / "city of " prefix.
 *   8. Strip wrapping punctuation.
 *   9. Collapse internal whitespace to single space, trim.
 */

const ARABIC_YEH = "ي";
const PERSIAN_YEH = "ی";
const ARABIC_KAF = "ك";
const PERSIAN_KAF = "ک";
const TATWEEL = "ـ";
const ZWNJ = "‌";

const DIACRITICS_PATTERN = /[ً-ٰٟ]/g;
const LEADING_PREFIXES = ["شهرستان ", "شهر ", "city of "];
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
