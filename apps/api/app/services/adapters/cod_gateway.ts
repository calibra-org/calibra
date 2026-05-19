import type { InitArgs, InitResult, PaymentAdapter, PaymentAdapterCapabilities } from "#services/adapters/base_redirect_gateway";

/**
 * Cash on delivery. Special non-redirect adapter — `init` returns `redirect_url=null` and the
 * `payment_service.init` caller transitions the order to `on_hold`. No PSP, no HTTP, no
 * `verify` / `parseCallback` / `refund`.
 */
export class CodGateway implements PaymentAdapter {
    readonly code = "cod";
    readonly capabilities: PaymentAdapterCapabilities = { redirect: false, refunds: false, partial_refunds: false };

    async init(_args: InitArgs): Promise<InitResult> {
        return { redirect_url: null, payload: { method: "cod" } };
    }
}

export const codGateway = new CodGateway();
