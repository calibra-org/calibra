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
        ...(process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",")
            .map((s) => s.trim())
            .filter(Boolean) ?? []),
    ],
    images: {
        /**
         * Allow product images served from the AdonisJS API host. Adjust as deployment hosts settle.
         * `localhost:3333` matches the default `apps/api` docker compose port.
         */
        remotePatterns: [
            { protocol: "http", hostname: "localhost", port: "3333", pathname: "/**" },
            { protocol: "https", hostname: "**", pathname: "/**" },
        ],
    },
};

export default withNextIntl(nextConfig);
