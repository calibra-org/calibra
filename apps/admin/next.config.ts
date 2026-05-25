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
     * Allow dev-server cross-origin requests from the per-spin Caddy hostnames. The spin
     * fronts the dev server at `https://admin.<slug>.spin.localhost:<caddyHttps>`; without
     * this list Next.js 15.3+ blocks `/_next/webpack-hmr` and other dev resources because
     * they originate from a hostname other than the dev server's own.
     *
     * Next's glob `*` matches a single dot-less segment, so `*.spin.localhost` only catches
     * `<one>.spin.localhost`. Our hostnames have two labels before `.spin.localhost`
     * (`admin.<slug>.spin.localhost`), so we also include `*.*.spin.localhost`. Spin.mjs
     * additionally emits `NEXT_DEV_ALLOWED_ORIGINS` with the literal hostnames as belt-and-
     * suspenders for any pattern Next doesn't accept; we merge that in here.
     */
    allowedDevOrigins: [
        "*.spin.localhost",
        "*.*.spin.localhost",
        ...(process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",")
            .map((s) => s.trim())
            .filter(Boolean) ?? []),
    ],
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
