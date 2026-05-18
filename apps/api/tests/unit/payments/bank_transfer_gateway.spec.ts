import { test } from "@japa/runner";

import PaymentAttempt from "#models/payment_attempt";
import { bankTransferGateway } from "#services/adapters/bank_transfer_gateway";
import { fetchCalls, mockFetch, unmockFetch } from "#tests/helpers/mock_fetch";
import { resetPhase08 } from "#tests/helpers/payments";

test.group("BankTransferGateway", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
        mockFetch({});
    });
    group.each.teardown(() => {
        unmockFetch();
    });

    test("init builds a customer-visible note from IBAN + account_name in settings", async ({ assert }) => {
        const result = await bankTransferGateway.init({
            order: { id: 1, orderNumber: 1, grandTotal: 100 } as never,
            attempt: new PaymentAttempt(),
            settings: { iban: "IR123456789012345678901234", account_name: "Calibra Co.", bank_name: "Mellat" },
            return_url: "http://localhost/cb",
        });
        assert.isNull(result.redirect_url);
        const payload = result.payload as { customer_note: string; iban: string; account_name: string };
        assert.equal(payload.iban, "IR123456789012345678901234");
        assert.equal(payload.account_name, "Calibra Co.");
        assert.match(payload.customer_note, /IR123456789012345678901234/);
        assert.match(payload.customer_note, /Calibra Co\./);
        assert.match(payload.customer_note, /Mellat/);
        assert.lengthOf(fetchCalls(), 0);
    });

    test("init copes with missing settings gracefully", async ({ assert }) => {
        const result = await bankTransferGateway.init({
            order: { id: 1, orderNumber: 1, grandTotal: 100 } as never,
            attempt: new PaymentAttempt(),
            settings: {},
            return_url: "http://localhost/cb",
        });
        assert.isNull(result.redirect_url);
        const payload = result.payload as { customer_note: string };
        assert.equal(payload.customer_note, "");
    });
});
