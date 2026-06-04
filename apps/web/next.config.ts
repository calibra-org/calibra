import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const nextConfig: NextConfig = {
    /**
     * `standalone` produces a self-contained server bundle in `.next/standalone/` — required for
     * the Dockerfile here. Do not switch back without rewriting it.
     */
    output: "standalone",
    reactStrictMode: true,
    /** `@calibra/shared` ships as raw TS source — Next compiles it like any local file. */
    transpilePackages: ["@calibra/shared"],
    /**
     * Allow dev-server cross-origin requests from the per-spin Caddy hostnames. The spin
     * fronts the dev server at `https://web.<slug>.spin.localhost:<caddyHttps>`; without
     * this list Next.js 15.3+ blocks `/_next/webpack-hmr` and other dev resources because
     * they originate from a hostname other than the dev server's own.
     *
     * Next's glob `*` matches a single dot-less segment, so `*.spin.localhost` only catches
     * `<one>.spin.localhost`. Our hostnames have two labels before `.spin.localhost`
     * (`web.<slug>.spin.localhost`), so we also include `*.*.spin.localhost`. Spin.mjs
     * additionally emits `NEXT_DEV_ALLOWED_ORIGINS` with the literal hostnames as belt-and-
     * suspenders for any pattern Next doesn't accept; we merge that in here.
     */
    allowedDevOrigins: [
        "*.spin.localhost",
        "*.*.spin.localhost",
        /** Dev shop subdomains served at `<slug>.shops.localhost:<port>` (RULE A). */
        "*.shops.localhost",
        /** Per-tenant storefront via the spin's Caddy: `<slug>.web.<spin>.spin.localhost`. */
        "*.web.*.spin.localhost",
        ...(process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",")
            .map((s) => s.trim())
            .filter(Boolean) ?? []),
    ],
    images: {
        /**
         * Allow product/branding images served from the AdonisJS API host (per-tenant `/uploads/*`)
         * and from the production CDN. `localhost`/`127.0.0.1` (any port) cover the dev + spin API
         * hosts; `https://**` covers per-shop CDN hosts and custom domains. Tighten the `https`
         * wildcard to the real CDN host once deployment domains settle.
         */
        remotePatterns: [
            { protocol: "http", hostname: "localhost", pathname: "/**" },
            { protocol: "http", hostname: "127.0.0.1", pathname: "/**" },
            { protocol: "http", hostname: "*.shops.localhost", pathname: "/**" },
            { protocol: "https", hostname: "**", pathname: "/**" },
        ],
    },
};

export default withNextIntl(nextConfig);
