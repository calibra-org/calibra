import type { Authenticators } from "@adonisjs/auth/types";
import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";

import { recordAuthEvent } from "#services/metrics/domain_metrics";

/**
 * Authenticates the request through one of the configured guards (`api` by default — the access
 * tokens guard) and rejects unauthenticated callers with a localized 401. The framework's
 * `E_UNAUTHORIZED_ACCESS` exception already carries an i18n key, so the exception handler is what
 * renders the final body — we only need to surface the right HTTP status.
 */
export default class AuthMiddleware {
    async handle(ctx: HttpContext, next: NextFn, options: { guards?: (keyof Authenticators)[] } = {}) {
        try {
            await ctx.auth.authenticateUsing(options.guards);
        } catch (err) {
            recordAuthEvent("token_invalid");
            throw err;
        }
        return next();
    }
}
