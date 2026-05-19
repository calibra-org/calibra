import db from "@adonisjs/lucid/services/db";

import PaymentGateway from "#models/payment_gateway";
import { resetPhase05 } from "#tests/helpers/orders";

/**
 * Drop every phase-08 row on top of the phase-05 reset and re-enable the gateways most tests need
 * out of the box (`cod`, `bank_transfer`, `zarinpal`). `zarinpal` keeps a placeholder `merchant_id`
 * so adapter tests can flip it off via PATCH /admin/payment-gateways/:id; the registry-only tests
 * disable+enable rows by id directly.
 */
export async function resetPhase08(): Promise<void> {
    await resetPhase05();
    await db.rawQuery(`TRUNCATE TABLE "payment_links", "payment_attempts" RESTART IDENTITY CASCADE`);
    /** Enable ZarinPal with a non-empty merchant_id so init can call the (mocked) endpoint. */
    const zarinpal = await PaymentGateway.findByOrFail("code", "zarinpal");
    zarinpal.enabled = true;
    zarinpal.settings = { ...((zarinpal.settings as Record<string, unknown>) ?? {}), merchant_id: "TEST-MERCHANT" };
    await zarinpal.save();
    const bank = await PaymentGateway.findByOrFail("code", "bank_transfer");
    bank.enabled = true;
    bank.settings = {
        ...((bank.settings as Record<string, unknown>) ?? {}),
        iban: "IR000000000000000001",
        account_name: "Calibra",
    };
    await bank.save();
}
