import { GatewayNotConfiguredException } from "#exceptions/payment_exceptions";
import type {
    InitArgs,
    InitResult,
    ParseCallbackArgs,
    ParsedCallback,
    PaymentAdapter,
    PaymentAdapterCapabilities,
    VerifyArgs,
    VerifyResult,
} from "#services/adapters/base_redirect_gateway";

/**
 * IDPay scaffold. A real adapter ships in a follow-up PR once ZarinPal is proven end-to-end.
 * Every entry point throws {@link GatewayNotConfiguredException} so accidentally enabling the
 * gateway in production surfaces a 422 instead of silently breaking checkout.
 */
export class IdpayGateway implements PaymentAdapter {
    readonly code = "idpay";
    readonly capabilities: PaymentAdapterCapabilities = { redirect: true, refunds: false, partial_refunds: false };

    async init(_args: InitArgs): Promise<InitResult> {
        throw new GatewayNotConfiguredException(this.code, "IDPay adapter is scaffolded but not implemented yet");
    }

    parseCallback(_args: ParseCallbackArgs): ParsedCallback {
        throw new GatewayNotConfiguredException(this.code, "IDPay adapter is scaffolded but not implemented yet");
    }

    async verify(_args: VerifyArgs): Promise<VerifyResult> {
        throw new GatewayNotConfiguredException(this.code, "IDPay adapter is scaffolded but not implemented yet");
    }
}

export const idpayGateway = new IdpayGateway();
