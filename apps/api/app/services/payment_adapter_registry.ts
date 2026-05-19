import { GatewayNotConfiguredException } from "#exceptions/payment_exceptions";
import PaymentGateway from "#models/payment_gateway";
import { bankTransferGateway } from "#services/adapters/bank_transfer_gateway";
import type { PaymentAdapter } from "#services/adapters/base_redirect_gateway";
import { codGateway } from "#services/adapters/cod_gateway";
import { idpayGateway } from "#services/adapters/idpay_gateway";
import { nextpayGateway } from "#services/adapters/nextpay_gateway";
import { payirGateway } from "#services/adapters/payir_gateway";
import { zarinpalGateway } from "#services/adapters/zarinpal_gateway";
import { zibalGateway } from "#services/adapters/zibal_gateway";

/**
 * Singleton registry of every PSP adapter. The map is initialized at module load — no DI
 * container plumbing needed because adapters are stateless (settings come from the gateway row at
 * resolve time, not at construction). New PSPs are a one-line `register()` call in the file
 * footer.
 *
 * Resolution throws {@link GatewayNotConfiguredException} when:
 *   1. The `code` is not registered (typo, future PSP, never wired).
 *   2. The matching `payment_gateways` row is missing OR disabled.
 *
 * Callers never branch on adapter class — they branch on `adapter.capabilities` instead.
 */
export class PaymentAdapterRegistry {
    private readonly adapters = new Map<string, PaymentAdapter>();

    register(adapter: PaymentAdapter): void {
        this.adapters.set(adapter.code, adapter);
    }

    has(code: string): boolean {
        return this.adapters.has(code);
    }

    get(code: string): PaymentAdapter {
        const adapter = this.adapters.get(code);
        if (!adapter) {
            throw new GatewayNotConfiguredException(code, `No payment adapter registered for code "${code}"`);
        }
        return adapter;
    }

    /**
     * DB-backed resolver. Loads the row, asserts it's enabled, and returns the adapter + the
     * row's settings/snapshot data. Use this from the storefront / admin code paths; the
     * registry-only `get()` is for tests + the future payment-link bridge.
     */
    async resolveForCode(code: string): Promise<{ adapter: PaymentAdapter; gateway: PaymentGateway }> {
        const adapter = this.get(code);
        const gateway = await PaymentGateway.query().where("code", code).first();
        if (!gateway) {
            throw new GatewayNotConfiguredException(code, `Payment gateway row for code "${code}" not found`);
        }
        if (!gateway.enabled) {
            throw new GatewayNotConfiguredException(code, `Payment gateway "${code}" is disabled`);
        }
        return { adapter, gateway };
    }

    async resolveForGatewayId(gatewayId: number | bigint): Promise<{ adapter: PaymentAdapter; gateway: PaymentGateway }> {
        const gateway = await PaymentGateway.find(Number(gatewayId));
        if (!gateway) {
            throw new GatewayNotConfiguredException(String(gatewayId), `Payment gateway id ${gatewayId} not found`);
        }
        if (!gateway.enabled) {
            throw new GatewayNotConfiguredException(gateway.code, `Payment gateway "${gateway.code}" is disabled`);
        }
        return { adapter: this.get(gateway.code), gateway };
    }
}

export const paymentAdapterRegistry = new PaymentAdapterRegistry();

paymentAdapterRegistry.register(zarinpalGateway);
paymentAdapterRegistry.register(idpayGateway);
paymentAdapterRegistry.register(nextpayGateway);
paymentAdapterRegistry.register(payirGateway);
paymentAdapterRegistry.register(zibalGateway);
paymentAdapterRegistry.register(codGateway);
paymentAdapterRegistry.register(bankTransferGateway);
