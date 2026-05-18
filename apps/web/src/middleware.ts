import createMiddleware from "next-intl/middleware";

import { routing } from "#/lib/i18n/routing";

export default createMiddleware(routing);

export const config = {
    /**
     * Match every request except Next.js internals, static assets, the API surface, and files with
     * an extension (favicon, sitemap, robots). The middleware only needs to see route requests so
     * it can rewrite for the active locale.
     */
    matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
