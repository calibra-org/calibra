import { randomUUID } from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";

/**
 * Attach a stable request id to every inbound request and echo it on the response.
 * Honours an upstream `X-Request-Id` header when present (load balancer / Cloudflare
 * already propagated it); otherwise mints a fresh UUID. The id surfaces in log lines
 * via the per-request child logger, and in the global exception handler's envelope.
 *
 * The framework's `ctx.request.id()` helper relies on this middleware setting the
 * header — without it, calls to that helper return undefined.
 */
export default class RequestIdMiddleware {
    async handle(ctx: HttpContext, next: NextFn) {
        const incoming = ctx.request.header("x-request-id");
        const id = typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
        ctx.request.headers()["x-request-id"] = id;
        (ctx.request as unknown as { id: () => string }).id = () => id;
        ctx.response.header("x-request-id", id);
        return next();
    }
}
