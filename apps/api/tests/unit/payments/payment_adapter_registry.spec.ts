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

    test("stub PSPs advertise the capabilities they would support if implemented", async ({ assert }) => {
        const zarinpal = paymentAdapterRegistry.get("zarinpal");
        assert.deepEqual(zarinpal.capabilities, { redirect: true, refunds: false, partial_refunds: false });

        const zibal = paymentAdapterRegistry.get("zibal");
        assert.deepEqual(zibal.capabilities, { redirect: true, refunds: true, partial_refunds: false });
    });

    test("resolveForCode on a stub gateway throws E_GATEWAY_NOT_IMPLEMENTED — even when the row is enabled", async ({
        assert,
    }) => {
        const zarinpal = await PaymentGateway.findByOrFail("code", "zarinpal");
        zarinpal.enabled = true;
        await zarinpal.save();

        await assert.rejects(() => paymentAdapterRegistry.resolveForCode("zarinpal"), /not yet implemented/);
        await assert.rejects(() => paymentAdapterRegistry.resolveForGatewayId(zarinpal.id), /not yet implemented/);
    });

    test("disabled live gateway throws GatewayNotConfigured", async ({ assert }) => {
        const cod = await PaymentGateway.findByOrFail("code", "cod");
        cod.enabled = false;
        await cod.save();
        await assert.rejects(() => paymentAdapterRegistry.resolveForCode("cod"), /disabled/);
        await assert.rejects(() => paymentAdapterRegistry.resolveForGatewayId(cod.id), /disabled/);
    });

    test("resolveForCode returns adapter + gateway row for a live, enabled gateway", async ({ assert }) => {
        const result = await paymentAdapterRegistry.resolveForCode("cod");
        assert.equal(result.adapter.code, "cod");
        assert.equal(result.gateway.code, "cod");
        assert.isTrue(result.gateway.enabled);
    });
});
