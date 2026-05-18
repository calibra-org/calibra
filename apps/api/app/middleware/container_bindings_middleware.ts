import { HttpContext } from "@adonisjs/core/http";
import { Logger } from "@adonisjs/core/logger";
import type { NextFn } from "@adonisjs/core/types/http";

/**
 * Binds request-scoped values into the IoC container so service classes can resolve `HttpContext`
 * and `Logger` directly without threading them through every function signature.
 */
export default class ContainerBindingsMiddleware {
    handle(ctx: HttpContext, next: NextFn) {
        ctx.containerResolver.bindValue(HttpContext, ctx);
        ctx.containerResolver.bindValue(Logger, ctx.logger);
        return next();
    }
}
