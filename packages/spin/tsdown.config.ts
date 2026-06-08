import { defineConfig } from "tsdown";

/**
 * Two-build pipeline. The whole point of the split is requirement #1 of the spin
 * overhaul: React is **bundled**, never loaded from a CDN.
 *
 * Build 1 (node) compiles the CLI, the Ink TUI, and the panel's HTTP server. React,
 * react-dom and Ink stay external and resolve from `node_modules` at runtime — the
 * terminal renders React server-side, so there is no browser to ship a bundle to.
 *
 * Build 2 (browser) compiles the panel's client entry with a catch-all `noExternal`
 * (match-everything) — the load-bearing flag that forces React 19 + react-dom/client +
 * scheduler + the JSX runtime to be inlined into `dist/agent/client.js`. The served page
 * references exactly one module script with zero network dependencies.
 *
 * @see {@link https://tsdown.dev}
 */
export default defineConfig([
    {
        entry: { cli: "src/cli.ts", "agent/server": "src/agent/server.ts" },
        format: ["esm"],
        platform: "node",
        target: "node22",
        deps: { neverBundle: [/^react(\/.*)?$/, /^react-dom(\/.*)?$/, "ink"] },
        fixedExtension: false,
        sourcemap: true,
        minify: false,
        clean: true,
        dts: false,
        outDir: "dist",
    },
    {
        entry: { "agent/client": "src/agent/client.tsx" },
        format: ["esm"],
        platform: "browser",
        target: "es2022",
        deps: { alwaysBundle: [/.*/] },
        sourcemap: true,
        minify: true,
        clean: false,
        dts: false,
        outDir: "dist",
    },
]);
