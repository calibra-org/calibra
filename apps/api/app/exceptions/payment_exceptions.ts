import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

/**
 * Gateway code is unknown to the registry OR the gateway row exists but is disabled. Surfaces as
 * 422 — the request was structurally valid but the payment method isn't available right now.
 */
export class GatewayNotConfiguredException extends Exception {
    static status = 422;
    static code = "E_PAYMENT_GATEWAY_NOT_CONFIGURED";

    constructor(gatewayCode: string, message?: string) {
        super(message ?? `Payment gateway "${gatewayCode}" is not configured`, {
            status: GatewayNotConfiguredException.status,
            code: GatewayNotConfiguredException.code,
        });
    }
}

/**
 * Gateway code is registered as a stub — the PSP adapter has not been integrated against a real
 * sandbox yet. Surfaces as 422 with `E_GATEWAY_NOT_IMPLEMENTED` so every surface (admin PATCH,
 * storefront submit, lifecycle calls) reports the same posture: we honestly do not yet
 * support this PSP. Meta carries `{ gateway, phase }` so logs distinguish init / verify / refund
 * call sites; the public `gateway` / `phase` properties let route-handler catch blocks branch
 * on the failure mode without re-parsing the message string.
 *
 * Matches the 422 vocabulary of the sibling {@link GatewayNotConfiguredException} — both are
 * "request was structurally valid but the payment method is unavailable" cases, distinguished
 * only by *why* the gateway is unavailable.
 */
export class GatewayNotImplementedException extends Exception {
    static status = 422;
    static code = "E_GATEWAY_NOT_IMPLEMENTED";

    readonly gateway: string;
    readonly phase: "init" | "verify" | "refund" | "enable";

    constructor(gateway: string, phase: "init" | "verify" | "refund" | "enable", message?: string) {
        super(message ?? `Payment gateway "${gateway}" is not yet implemented (phase: ${phase})`, {
            status: GatewayNotImplementedException.status,
            code: GatewayNotImplementedException.code,
        });
        this.gateway = gateway;
        this.phase = phase;
    }

    async handle(error: this, ctx: HttpContext) {
        return ctx.response.status(error.status).json({
            errors: [
                {
                    message: error.message,
                    code: error.code,
                    gateway: error.gateway,
                    phase: error.phase,
                },
            ],
        });
    }
}

/**
 * PSP `verify` call returned a non-success code OR the PSP HTTP layer failed. The attempt is
 * marked failed; the order moves to `failed`. Surfaces as 422 so the storefront can render a "try
 * again" affordance — never a 500.
 */
export class VerifyFailedException extends Exception {
    static status = 422;
    static code = "E_PAYMENT_VERIFY_FAILED";

    constructor(detail: string, message?: string) {
        super(message ?? `Payment verification failed: ${detail}`, {
            status: VerifyFailedException.status,
            code: VerifyFailedException.code,
        });
    }
}

/**
 * PSP reports a different amount than the attempt row records. Treated as a forged callback;
 * never transitions the order to processing.
 */
export class AmountMismatchException extends Exception {
    static status = 422;
    static code = "E_PAYMENT_AMOUNT_MISMATCH";

    constructor(expected: number, got: number) {
        super(`Payment amount mismatch: expected ${expected}, got ${got}`, {
            status: AmountMismatchException.status,
            code: AmountMismatchException.code,
        });
    }
}

/**
 * Replayed callback for an already-verified attempt. Surfaced as a soft 200 by callers; this
 * class exists for the rare path where the caller wants the typed signal explicitly.
 */
export class AlreadyVerifiedException extends Exception {
    static status = 409;
    static code = "E_PAYMENT_ALREADY_VERIFIED";

    constructor(attemptId: number | bigint) {
        super(`Payment attempt ${attemptId} is already verified`, {
            status: AlreadyVerifiedException.status,
            code: AlreadyVerifiedException.code,
        });
    }
}
