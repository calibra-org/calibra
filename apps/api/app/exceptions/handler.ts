import { ExceptionHandler, type HttpContext } from "@adonisjs/core/http";
import app from "@adonisjs/core/services/app";

/**
 * Global HTTP exception handler. Inherits the framework default — extend `handle` for
 * project-specific error envelopes and `report` for telemetry (Sentry, Axiom, OTel).
 */
export default class HttpExceptionHandler extends ExceptionHandler {
    /** Verbose stack traces are emitted outside production only. */
    protected debug = !app.inProduction;

    async handle(error: unknown, ctx: HttpContext) {
        return super.handle(error, ctx);
    }

    async report(error: unknown, ctx: HttpContext) {
        return super.report(error, ctx);
    }
}
