import { RAW_COLOR_UTILITY, stringScanner } from "../lib/match.js";

/**
 * Semantic tokens only. Bans raw Tailwind palette utilities (`text-red-600`, `bg-emerald-100`,
 * `border-amber-500`) anywhere outside `globals.css`, where the semantic roles are defined.
 *
 * This is the rule form of the standalone `scripts/lint-tokens.mjs` scanner. That script existed
 * only because Biome v2 exposed no ESLint-style `no-restricted-syntax` against class strings;
 * oxlint's JS plugins do, so the scanner's regex moves here unchanged and gains real source
 * positions, editor squiggles, and per-file suppression.
 */
export default {
    meta: {
        type: "problem",
        docs: { description: "Use semantic colour tokens — never raw Tailwind palette utilities." },
        messages: {
            "raw-palette":
                "`{{utility}}` is a raw palette utility — use a semantic token (`text-danger`, `bg-success`, `border-warning`, …).",
        },
    },
    create(context) {
        return stringScanner((text, node) => {
            const match = RAW_COLOR_UTILITY.exec(text);
            if (match !== null) context.report({ node, messageId: "raw-palette", data: { utility: match[0] } });
        });
    },
};
