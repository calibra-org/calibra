import { GatewayNotImplementedException } from "#exceptions/payment_exceptions";
import type {
    InitArgs,
    InitResult,
    ParseCallbackArgs,
    ParsedCallback,
    PaymentAdapter,
    PaymentAdapterCapabilities,
    RefundArgs,
    RefundResult,
    VerifyArgs,
    VerifyResult,
} from "#services/adapters/base_redirect_gateway";

/**
 * Honest stand-in for every PSP the platform knows about but does not yet integrate. One class
 * serves all five Iranian PSPs (`zarinpal`, `idpay`, `nextpay`, `payir`, `zibal`); each
 * registration constructs the instance with its own `code` + publicly-advertised
 * {@link PaymentAdapterCapabilities} so the admin UI can render the right "supports refunds"
 * badges even while the integration is missing.
 *
 * - `init` / `verify` / `refund` throw {@link GatewayNotImplementedException} so the validator,
 *   storefront, and admin layers all see the same `E_GATEWAY_NOT_IMPLEMENTED` shape.
 * - `parseCallback` does not throw — the callback endpoint is browser-facing, so a stray PSP
 *   redirect-hop returns a synthetic failed parse the caller can map to a clean 302 instead of
 *   bubbling a 500 onto the user. Real PSP integrations replace this whole class.
 */
export class UnimplementedPspGateway implements PaymentAdapter {
    constructor(
        readonly code: string,
        readonly capabilities: PaymentAdapterCapabilities,
    ) {}

    async init(_args: InitArgs): Promise<InitResult> {
        throw new GatewayNotImplementedException(this.code, "init");
    }

    parseCallback(_args: ParseCallbackArgs): ParsedCallback {
        return {
            status: "failed",
            payload: { error: "gateway_not_implemented", gateway: this.code },
        };
    }

    async verify(_args: VerifyArgs): Promise<VerifyResult> {
        throw new GatewayNotImplementedException(this.code, "verify");
    }

    async refund(_args: RefundArgs): Promise<RefundResult> {
        throw new GatewayNotImplementedException(this.code, "refund");
    }
}
