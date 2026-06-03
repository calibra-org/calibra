import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "jsdom",
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        globals: true,
    },
    resolve: {
        alias: {
            "#": new URL("./src", import.meta.url).pathname,
            /** `server-only` is a Next runtime marker with no test-time module — stub it out. */
            "server-only": new URL("./src/test-stubs/server-only.ts", import.meta.url).pathname,
        },
    },
});
