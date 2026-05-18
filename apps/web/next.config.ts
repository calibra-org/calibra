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
