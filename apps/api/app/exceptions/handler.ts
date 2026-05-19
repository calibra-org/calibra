import { Exception } from "@adonisjs/core/exceptions";
import { ExceptionHandler, type HttpContext } from "@adonisjs/core/http";
import app from "@adonisjs/core/services/app";

/**
 * Map of domain error codes → i18n keys, looked up by `ctx.i18n.t()`. Adding a translation entry
 * + a code here is the only step needed to localize a new error — the throw site keeps its
 * English-default message as a fallback for environments where translations are missing.
 */
const LOCALIZED_ORDER_CODES: Record<string, string> = {
    E_ILLEGAL_ORDER_TRANSITION: "errors.orders.illegal_transition",
    E_ORDER_NOT_DRAFT: "errors.orders.not_draft",
    E_BILLING_REQUIRED: "errors.orders.billing_required",
    E_PAYMENT_REQUIRED: "errors.orders.payment_required",
    E_ORDER_EMPTY: "errors.orders.empty",
    E_PRICE_CHANGED: "errors.orders.price_changed",
};

/**
 * Global HTTP exception handler. Adds a localization shim on top of the framework default — every
 * domain code declared in {@link LOCALIZED_ORDER_CODES} is rendered through the active i18n
 * catalog (selected from `Accept-Language` by `@adonisjs/i18n`) before the framework serializes
 * the error body. Codes without an entry pass through unchanged.
 */
export default class HttpExceptionHandler extends ExceptionHandler {
    /** Verbose stack traces are emitted outside production only. */
    protected debug = !app.inProduction;

    async handle(error: unknown, ctx: HttpContext) {
        if (error instanceof Exception) {
            const e = error as Exception & { code?: string; message: string };
            const key = e.code ? LOCALIZED_ORDER_CODES[e.code] : undefined;
            if (key && ctx.i18n) {
                const localized = ctx.i18n.t(key, this.extractInterpolation(e), e.message);
                if (localized) {
                    Object.defineProperty(e, "message", { value: localized, configurable: true });
                }
            }
        }
        return super.handle(error, ctx);
    }

    async report(error: unknown, ctx: HttpContext) {
        return super.report(error, ctx);
    }

    private extractInterpolation(error: unknown): Record<string, unknown> {
        const transition = (error as { transition?: { from: string; to: string } }).transition;
        if (transition) return transition;
        const message = (error as Error).message ?? "";
        const match = /transition:\s*(\w+)\s*→\s*(\w+)/.exec(message);
        if (match) return { from: match[1], to: match[2] };
        return {};
    }
}
