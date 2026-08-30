import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";

/**
 * A `RuleTester` wired to the TypeScript parser with JSX enabled, matching how every file these
 * rules actually run against is parsed. Shared so a rule suite declares only its cases.
 */
export const ruleTester = new RuleTester({
    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2023,
        sourceType: "module",
        parserOptions: { ecmaFeatures: { jsx: true } },
    },
});
