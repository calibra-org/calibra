/**
 * Shared matchers for the class-string lints, plus a helper that runs a check over every string
 * the source actually renders.
 *
 * Rules visit string `Literal`s and template quasis rather than raw lines, so a utility class is
 * flagged only where it is a real value — never inside a comment or a JSDoc block. Tailwind
 * classes are always strings, so this is a faithful subset of line scanning, not a narrower one.
 */

/**
 * Colour families that have a semantic equivalent in `globals.css`. Ported verbatim from the
 * `scripts/lint-tokens.mjs` scanner this rule set replaces.
 */
const BANNED_FAMILIES = [
    "red",
    "orange",
    "amber",
    "yellow",
    "lime",
    "green",
    "emerald",
    "teal",
    "cyan",
    "sky",
    "blue",
    "indigo",
    "violet",
    "purple",
    "fuchsia",
    "pink",
    "rose",
];

/** Tailwind utility prefixes that take a colour. */
const COLOR_PREFIXES = [
    "text",
    "bg",
    "border",
    "ring",
    "from",
    "to",
    "via",
    "decoration",
    "outline",
    "shadow",
    "divide",
    "placeholder",
    "caret",
    "accent",
    "fill",
    "stroke",
];

/** A raw palette utility: colour-taking prefix, banned family, numeric step (`text-red-600`). */
export const RAW_COLOR_UTILITY = new RegExp(`\\b(?:${COLOR_PREFIXES.join("|")})-(?:${BANNED_FAMILIES.join("|")})-\\d{2,3}\\b`);

/** A Tailwind value follows the dash: a number, arbitrary `[…]`, `px`, `auto`, or `full`. */
const VALUE = "(?:\\d|\\[|px|auto|full)";

/**
 * Physical (direction-locked) Tailwind utilities, anchored to a class boundary so `formal-4` and
 * `overflow-x-auto` never match. The optional leading `-` covers negative utilities (`-ml-2`).
 */
export const PHYSICAL_CLASS = new RegExp(
    `(?<![\\w-])-?(?:[mp][lr]-${VALUE}|(?:left|right)-${VALUE}|inset-[lr]-${VALUE}|scroll-[mp][lr]-${VALUE}` +
        "|text-(?:left|right)\\b|border-[lr](?:-(?:\\d|\\[)|\\b)|rounded-[lr]\\b|rounded-(?:tl|tr|bl|br)\\b)",
);

/** Boundary flags for plain string literals — never adjacent to a template expression. */
const NO_BOUNDARY = Object.freeze({ leading: false, trailing: false });

/**
 * Build a visitor that runs `check(text, node, boundaries)` over every rendered string: each string
 * `Literal`, and each quasi of every `TemplateLiteral` (reported at the quasi for a precise loc).
 *
 * `boundaries` says whether the text follows (`leading`) or precedes (`trailing`) a template
 * expression, so a rule classifying whole class tokens can skip the partial token sitting against
 * an interpolation. Rules that scan whole strings ignore the third argument.
 *
 * @param {(text: string, node: object, boundaries: { leading: boolean, trailing: boolean }) => void} check
 */
export function stringScanner(check) {
    return {
        Literal(node) {
            if (typeof node.value === "string") check(node.value, node, NO_BOUNDARY);
        },
        TemplateLiteral(node) {
            node.quasis.forEach((quasi, index) => {
                check(quasi.value.cooked ?? quasi.value.raw, quasi, { leading: index > 0, trailing: !quasi.tail });
            });
        },
    };
}

/**
 * Build a visitor that reports any import whose module specifier satisfies `matches`. Covers the
 * three forms a module can enter a file: a static `import`, a re-`export … from`, and a dynamic
 * `import()` with a literal specifier.
 *
 * @param {(source: string) => boolean} matches
 * @param {(node: object) => void} report
 */
export function importScanner(matches, report) {
    const check = (node) => {
        if (node.source && typeof node.source.value === "string" && matches(node.source.value)) report(node);
    };
    return {
        ImportDeclaration: check,
        ExportNamedDeclaration: check,
        ExportAllDeclaration: check,
        ImportExpression(node) {
            if (node.source?.type === "Literal" && typeof node.source.value === "string" && matches(node.source.value)) {
                report(node);
            }
        },
    };
}
