import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const nextConfig: NextConfig = {
    /** Self-contained server bundle for the Dockerfile; do not change without rewriting it. */
    output: "standalone",
    reactStrictMode: true,
    /** `@calibra/shared` ships as raw TS source — Next compiles it like any local file. */
    transpilePackages: ["@calibra/shared"],
};

export default withNextIntl(nextConfig);
