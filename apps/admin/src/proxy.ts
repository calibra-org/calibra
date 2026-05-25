import createMiddleware from "next-intl/middleware";

import { routing } from "#/lib/i18n/routing";

export default createMiddleware(routing);

export const config = {
    matcher: ["/((?!api|__transmit|_next|_vercel|.*\\..*).*)"],
};
