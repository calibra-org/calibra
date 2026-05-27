import { GatewayNotConfiguredException, GatewayNotImplementedException } from "#exceptions/payment_exceptions";
import PaymentGateway from "#models/payment_gateway";
import { bankTransferGateway } from "#services/adapters/bank_transfer_gateway";
import type { PaymentAdapter, PaymentAdapterCapabilities } from "#services/adapters/base_redirect_gateway";
import { codGateway } from "#services/adapters/cod_gateway";
import { UnimplementedPspGateway } from "#services/adapters/unimplemented_psp_gateway";
import { readImplementationStatus } from "#transformers/payment_gateway_transformer";

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
 *
 * The five Iranian PSPs (`zarinpal`, `idpay`, `nextpay`, `payir`, `zibal`) all resolve to a
 * single {@link UnimplementedPspGateway} instance per code: each one advertises the capability
 * envelope the real PSP supports in principle (so the admin UI shows accurate "refunds" badges)
 * while every lifecycle method throws `E_GATEWAY_NOT_IMPLEMENTED` until a follow-up phase ships
 * a real adapter and flips `implementation_status` on the seed row to `"live"`.
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
        /**
         * Stub gateways short-circuit before the enabled-check so every surface gets a uniform
         * `E_GATEWAY_NOT_IMPLEMENTED` instead of the misleading "is disabled" message.
         */
        if (readImplementationStatus(gateway) === "stub") {
            throw new GatewayNotImplementedException(code, "verify");
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
        if (readImplementationStatus(gateway) === "stub") {
            throw new GatewayNotImplementedException(gateway.code, "init");
        }
        if (!gateway.enabled) {
            throw new GatewayNotConfiguredException(gateway.code, `Payment gateway "${gateway.code}" is disabled`);
        }
        return { adapter: this.get(gateway.code), gateway };
    }
}

export const paymentAdapterRegistry = new PaymentAdapterRegistry();

/**
 * Per-PSP capability envelopes — kept in sync with each provider's public API surface so the
 * admin UI renders accurate badges even while every adapter is a stub. When a real integration
 * lands, drop the entry here and `register()` the concrete adapter instead.
 */
const STUB_PSP_CAPABILITIES: ReadonlyArray<{ code: string; capabilities: PaymentAdapterCapabilities }> = [
    { code: "zarinpal", capabilities: { redirect: true, refunds: false, partial_refunds: false } },
    { code: "idpay", capabilities: { redirect: true, refunds: true, partial_refunds: false } },
    { code: "nextpay", capabilities: { redirect: true, refunds: false, partial_refunds: false } },
    { code: "payir", capabilities: { redirect: true, refunds: true, partial_refunds: false } },
    { code: "zibal", capabilities: { redirect: true, refunds: true, partial_refunds: false } },
];

for (const { code, capabilities } of STUB_PSP_CAPABILITIES) {
    paymentAdapterRegistry.register(new UnimplementedPspGateway(code, capabilities));
}

paymentAdapterRegistry.register(codGateway);
paymentAdapterRegistry.register(bankTransferGateway);
