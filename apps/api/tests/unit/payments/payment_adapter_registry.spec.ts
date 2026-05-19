import { test } from "@japa/runner";

import PaymentGateway from "#models/payment_gateway";
import { paymentAdapterRegistry } from "#services/payment_adapter_registry";
import { resetPhase08 } from "#tests/helpers/payments";

test.group("PaymentAdapterRegistry", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
    });

    test("resolves every shipped gateway code", async ({ assert }) => {
        const codes = ["zarinpal", "idpay", "nextpay", "payir", "zibal", "cod", "bank_transfer"];
        for (const code of codes) {
            const adapter = paymentAdapterRegistry.get(code);
            assert.equal(adapter.code, code);
        }
    });

    test("unknown code throws GatewayNotConfigured", async ({ assert }) => {
        assert.throws(() => paymentAdapterRegistry.get("not_a_real_gateway"), /not_a_real_gateway/);
    });

    test("disabled gateway in DB throws even when code is registered", async ({ assert }) => {
        const cod = await PaymentGateway.findByOrFail("code", "cod");
        cod.enabled = false;
        await cod.save();
        await assert.rejects(() => paymentAdapterRegistry.resolveForCode("cod"), /disabled/);
        await assert.rejects(() => paymentAdapterRegistry.resolveForGatewayId(cod.id), /disabled/);
    });

    test("resolveForCode returns adapter + gateway row when enabled", async ({ assert }) => {
        const result = await paymentAdapterRegistry.resolveForCode("zarinpal");
        assert.equal(result.adapter.code, "zarinpal");
        assert.equal(result.gateway.code, "zarinpal");
        assert.isTrue(result.gateway.enabled);
    });
});
