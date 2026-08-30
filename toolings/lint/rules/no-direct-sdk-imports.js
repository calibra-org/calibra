/**
 * The SDK client factories are constructed only in an app's own `lib/api.ts`. That wrapper is what
 * passes `locale: useLocale()` into `createApiClient`, which is what makes the SDK send
 * `Accept-Language` — the header the AdonisJS backend reads to choose its translation catalog.
 *
 * A client built anywhere else silently drops that, so the API answers in the default locale while
 * the surrounding page renders in Persian. The failure is invisible in English and surfaces only as
 * stray untranslated strings, which is exactly the kind of bug review misses.
 *
 * Only the factories are restricted. Importing types, envelopes, or `BackendError` from
 * `@calibra/sdk` carries no client and no locale, so those imports are left alone — the package is
 * the correct source for them. The wrappers themselves are exempted in `.oxlintrc.json`.
 */

/** The factory functions that mint a configured HTTP client. */
const CLIENT_FACTORIES = new Set(["createApiClient", "createStorefrontClient"]);

const isSdk = (source) => source === "@calibra/sdk" || source.startsWith("@calibra/sdk/");

export default {
    meta: {
        type: "problem",
        docs: { description: "Construct SDK clients only in `lib/api.ts` — elsewhere import that wrapper." },
        messages: {
            factory:
                "Import the app's `#/lib/api` wrapper instead of calling `{{name}}` here — the wrapper forwards the active locale as `Accept-Language`, and a hand-built client silently loses backend translations.",
        },
    },
    create(context) {
        /**
         * A type-only import cannot construct anything at runtime, so `import type { … }` and the
         * per-specifier `type` form are both out of scope even when they name a factory.
         */
        const check = (node) => {
            if (!node.source || typeof node.source.value !== "string" || !isSdk(node.source.value)) return;
            if (node.importKind === "type" || node.exportKind === "type") return;

            for (const specifier of node.specifiers ?? []) {
                const name = specifier.imported?.name ?? specifier.local?.name;
                if (specifier.importKind === "type") continue;
                if (name && CLIENT_FACTORIES.has(name)) {
                    context.report({ node: specifier, messageId: "factory", data: { name } });
                }
            }
        };

        return {
            ImportDeclaration: check,
            ExportNamedDeclaration: check,
        };
    },
};
