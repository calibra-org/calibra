import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";

/**
 * Forces every response to be JSON. Without this, validator and auth errors negotiate via the
 * inbound `Accept` header and may render as HTML — never what we want for a pure API.
 */
export default class ForceJsonResponseMiddleware {
    async handle({ request }: HttpContext, next: NextFn) {
        const headers = request.headers();
        headers.accept = "application/json";
        return next();
    }
}
