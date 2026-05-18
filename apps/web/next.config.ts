import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const nextConfig: NextConfig = {
    /**
     * `standalone` produces a self-contained server bundle in `.next/standalone/` — required for
     * the Dockerfile here, which copies that directory into a minimal runtime image. Do not switch
     * back to the default output without rewriting the Dockerfile.
     */
    output: "standalone",
    reactStrictMode: true,
    images: {
        /**
         * Allow product images served from the WordPress backend. Adjust as deployment hosts settle.
         * The `localhost:8080` entry matches the default `apps/cms` docker compose port.
         */
        remotePatterns: [
            { protocol: "http", hostname: "localhost", port: "8080", pathname: "/wp-content/**" },
            { protocol: "https", hostname: "**", pathname: "/wp-content/**" },
        ],
    },
};

export default withNextIntl(nextConfig);
