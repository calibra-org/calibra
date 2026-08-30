import { importScanner } from "../lib/match.js";

/**
 * The storefront never imports `@calibra/panel-kit`. The package holds token-driven base primitives
 * shared by the two shadcn operator panels (`apps/admin`, `apps/platform`); `apps/web` is
 * deliberately pure Tailwind with no shadcn, no Radix, and no class-variance-authority.
 *
 * One such import drags that whole dependency chain into the storefront bundle and starts eroding
 * the design-language split that AGENTS.md calls "the rule, not a temporary state". Scoped to
 * `apps/web/**` through `.oxlintrc.json` overrides.
 */
export default {
    meta: {
        type: "problem",
        docs: { description: "`apps/web` must not import `@calibra/panel-kit` — the storefront is pure Tailwind." },
        messages: {
            forbidden:
                "`apps/web` must not import `@calibra/panel-kit`. The storefront is pure Tailwind (no shadcn/Radix); panel-kit is for the operator panels. Write the component by hand.",
        },
    },
    create(context) {
        return importScanner(
            (source) => source === "@calibra/panel-kit" || source.startsWith("@calibra/panel-kit/"),
            (node) => context.report({ node, messageId: "forbidden" }),
        );
    },
};
