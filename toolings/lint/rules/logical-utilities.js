import { PHYSICAL_CLASS, stringScanner } from "../lib/match.js";

/**
 * Logical utilities only. The storefront and both operator panels default to Persian and flip to
 * RTL through `<html dir>`, so a direction-locked utility (`ml-4`, `text-left`, `rounded-l`) is a
 * layout bug in the default locale rather than a style preference — it does not mirror.
 *
 * Flags the physical form and points at its logical counterpart (`ms-*`, `text-start`,
 * `rounded-s`), which Tailwind v4 resolves against the active direction.
 */
export default {
    meta: {
        type: "problem",
        docs: { description: "Use RTL-safe logical utilities (`ms-*` / `me-*` / `text-start`) over physical ones." },
        messages: {
            physical:
                "`{{utility}}` is direction-locked and will not mirror in RTL — use its logical counterpart (`ms-*`, `me-*`, `text-start`, `rounded-s`, …).",
        },
    },
    create(context) {
        return stringScanner((text, node, boundaries) => {
            const match = PHYSICAL_CLASS.exec(text);
            if (match === null) return;

            /**
             * A match touching an interpolation boundary is a partial token — the real class is
             * assembled at runtime and cannot be judged from this quasi alone.
             */
            const atStart = match.index === 0 && boundaries.leading;
            const atEnd = match.index + match[0].length === text.length && boundaries.trailing;
            if (atStart || atEnd) return;

            context.report({ node, messageId: "physical", data: { utility: match[0].trim() } });
        });
    },
};
