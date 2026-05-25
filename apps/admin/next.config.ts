import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const nextConfig: NextConfig = {
    /** Self-contained server bundle for the Dockerfile; do not change without rewriting it. */
    output: "standalone",
    reactStrictMode: true,
    /** `@calibra/shared` ships as raw TS source — Next compiles it like any local file. */
    transpilePackages: ["@calibra/shared"],
    /**
     * Pin Turbopack's workspace root to the monorepo this `apps/admin` lives in. Without
     * this, when the dir tree contains another `pnpm-workspace.yaml` higher up (e.g. when
     * `apps/admin` runs from inside a `.claude/worktrees/<slug>/apps/admin` directory nested
     * under the main repo), Turbopack picks the outer workspace and starts serving stale
     * files from the wrong tree.
     */
    turbopack: {
        root: path.resolve(import.meta.dirname, "../.."),
    },
    /**
     * The `@adonisjs/transmit-client` hard-codes `${baseUrl}/__transmit/events` for the SSE
     * handshake and `/__transmit/{subscribe,unsubscribe}` for channel management — there is no
     * client-side override. We host the proxy under `/api/__transmit/*` (where the rest of the
     * admin same-origin proxies live) and rewrite the top-level path here.
     */
    async rewrites() {
        return [
            {
                source: "/__transmit/:path*",
                destination: "/api/transmit/:path*",
            },
        ];
    },
};

export default withNextIntl(nextConfig);
