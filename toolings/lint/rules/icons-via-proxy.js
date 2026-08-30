import { importScanner } from "../lib/match.js";

/**
 * Icons come from the `#/icons` proxy, never straight from `lucide-react`. The proxy is the single
 * re-export surface (`apps/admin/src/icons/`) that keeps the icon set enumerable, lets one import
 * be swapped for the whole app, and keeps tree-shaking predictable.
 *
 * Replaces the Biome `noRestrictedImports` override that enforced this before the oxc migration.
 * The proxy folder itself is exempted through `.oxlintrc.json` overrides rather than a path check
 * here, so the rule stays portable and the exemption stays visible in config.
 */
export default {
    meta: {
        type: "problem",
        docs: { description: "Import icons from the `#/icons` proxy rather than directly from `lucide-react`." },
        messages: {
            direct: "Import icons from `#/icons` — never directly from `lucide-react`. See apps/admin/src/icons/README.md.",
        },
    },
    create(context) {
        return importScanner(
            (source) => source === "lucide-react" || source.startsWith("lucide-react/"),
            (node) => context.report({ node, messageId: "direct" }),
        );
    },
};
