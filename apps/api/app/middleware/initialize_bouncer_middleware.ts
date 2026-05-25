import { Bouncer } from "@adonisjs/bouncer";
import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";

import * as abilities from "#abilities/main";

/**
 * Initialises a per-request {@link Bouncer} instance off `ctx.auth.user`, so handlers can call
 * `ctx.bouncer.authorize(ability, resource)` without re-resolving the user. The barrel-imported
 * abilities make string-keyed references (`bouncer.allows('viewOrder', …)`) available too — used
 * by transformers when computing row-level permissions for the admin UI.
 *
 * Policies aren't wired yet (this API project has no `app/policies/` directory). When a first
 * policy lands, swap `{}` for `import { policies } from '#generated/policies'` and the framework
 * barrel will pick it up.
 */
export default class InitializeBouncerMiddleware {
    async handle(ctx: HttpContext, next: NextFn) {
        ctx.bouncer = new Bouncer(() => ctx.auth.user || null, abilities, {}).setContainerResolver(ctx.containerResolver);
        return next();
    }
}

declare module "@adonisjs/core/http" {
    export interface HttpContext {
        bouncer: Bouncer<Exclude<HttpContext["auth"]["user"], undefined>, typeof abilities, Record<never, never>>;
    }
}
