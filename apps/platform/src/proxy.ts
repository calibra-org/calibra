import createMiddleware from "next-intl/middleware";

import { routing } from "#/lib/i18n/routing";

/**
 * Control-plane request pipeline. Unlike the admin panel, the console is a single **global** host
 * (NOT per-tenant), so there is no tenant resolution here — just next-intl locale routing. Auth is
 * enforced in the authenticated layout via `requireSession`, not in middleware.
 */
export default createMiddleware(routing);

export const config = {
    matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
