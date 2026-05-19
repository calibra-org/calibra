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

/** Pay.ir scaffold. */
export class PayirGateway implements PaymentAdapter {
    readonly code = "payir";
    readonly capabilities: PaymentAdapterCapabilities = { redirect: true, refunds: false, partial_refunds: false };

    async init(_args: InitArgs): Promise<InitResult> {
        throw new GatewayNotConfiguredException(this.code, "Pay.ir adapter is scaffolded but not implemented yet");
    }

    parseCallback(_args: ParseCallbackArgs): ParsedCallback {
        throw new GatewayNotConfiguredException(this.code, "Pay.ir adapter is scaffolded but not implemented yet");
    }

    async verify(_args: VerifyArgs): Promise<VerifyResult> {
        throw new GatewayNotConfiguredException(this.code, "Pay.ir adapter is scaffolded but not implemented yet");
    }
}

export const payirGateway = new PayirGateway();
