import iconsViaProxy from "./rules/icons-via-proxy.js";
import logicalUtilities from "./rules/logical-utilities.js";
import noDirectSdkImports from "./rules/no-direct-sdk-imports.js";
import noPanelKitInWeb from "./rules/no-panel-kit-in-web.js";
import semanticTokens from "./rules/semantic-tokens.js";

/**
 * The Calibra lint plugin — ESLint-compatible rule modules that run on oxlint through the
 * `jsPlugins` entry in `.oxlintrc.json` and stay portable to ESLint's `RuleTester` for unit tests.
 *
 * Each rule encodes an invariant AGENTS.md already states in prose but nothing enforced:
 *
 * - `semantic-tokens` — raw Tailwind palette utilities never appear outside `globals.css`.
 *   The rule form of the retired `scripts/lint-tokens.mjs` scanner.
 * - `logical-utilities` — styling stays RTL-safe (`ms-*` / `me-*` / `text-start`), because
 *   both frontends default to Persian.
 * - `icons-via-proxy` — icons resolve through `#/icons`, never `lucide-react` directly.
 *   Replaces the Biome `noRestrictedImports` override.
 * - `no-panel-kit-in-web` — the storefront stays pure Tailwind and out of `@calibra/panel-kit`.
 * - `no-direct-sdk-imports` — API clients are built in `lib/api.ts`, the only place that forwards
 *   the active locale to the backend.
 */
const plugin = {
    meta: { name: "calibra" },
    rules: {
        "semantic-tokens": semanticTokens,
        "logical-utilities": logicalUtilities,
        "icons-via-proxy": iconsViaProxy,
        "no-panel-kit-in-web": noPanelKitInWeb,
        "no-direct-sdk-imports": noDirectSdkImports,
    },
};

export default plugin;
