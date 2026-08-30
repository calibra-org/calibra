import { defineConfig } from "vitest/config";

/**
 * `globals: true` is load-bearing, not a convenience. ESLint's `RuleTester` registers its cases
 * through whatever `describe` / `it` it finds on the global object; with no globals it runs every
 * case eagerly at import time and vitest collects an empty file ("No test suite found").
 */
export default defineConfig({
    test: {
        environment: "node",
        globals: true,
        include: ["tests/**/*.test.js"],
    },
});
