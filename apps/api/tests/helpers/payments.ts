import db from "@adonisjs/lucid/services/db";

import PaymentGateway from "#models/payment_gateway";
import { resetPhase05 } from "#tests/helpers/orders";

/**
 * Canonical post-seed state for the five stub PSP gateways. The foundation seeder ships them
 * `enabled: false` to enforce that stubs cannot be flipped on through the database — only
 * through the admin PATCH flow, which the validator (`E_GATEWAY_NOT_IMPLEMENTED`) refuses.
 * Any spec that bypasses the validator and writes `enabled = true` directly (the unit-level
 * registry tests do exactly that) corrupts this invariant for every subsequent spec that
 * reads it back.
 */
const STUB_PSP_CODES = ["zarinpal", "idpay", "nextpay", "payir", "zibal"] as const;

/**
 * Drop every phase-08 row on top of the phase-05 reset. Configures `bank_transfer` with the
 * required IBAN + account name so the storefront submit flow can route through the only live
 * redirect-less gateway alongside `cod`. Both live gateways are forced back to `enabled: true`
 * — `resetWithFoundation()` no longer reruns the foundation seeder when the table merely has
 * rows (only when it's been truncated), so per-test mutations to `cod.enabled` would otherwise
 * leak into the next test. The same logic applies to the stub PSPs: tests in the registry
 * suite poke `enabled = true` directly to exercise the disabled-vs-unimplemented branch, so
 * this helper restores `enabled: false` on each of them as the canonical phase-08 invariant.
 *
 * Note: this used to also enable `zarinpal` so callback tests could mock its HTTP endpoints.
 * That coverage was retired when the PSP adapters were stubbed out — every PSP that requires a
 * real HTTP integration (`zarinpal`, `idpay`, `nextpay`, `payir`, `zibal`) now resolves to
 * `UnimplementedPspGateway` and the registry refuses to serve them regardless of `enabled`.
 */
export async function resetPhase08(): Promise<void> {
    await resetPhase05();
    await db.rawQuery(`TRUNCATE TABLE "payment_links", "payment_attempts" RESTART IDENTITY CASCADE`);
    const bank = await PaymentGateway.findByOrFail("code", "bank_transfer");
    bank.enabled = true;
    bank.settings = {
        ...((bank.settings as Record<string, unknown>) ?? {}),
        iban: "IR000000000000000001",
        account_name: "Calibra",
    };
    await bank.save();
    const cod = await PaymentGateway.findByOrFail("code", "cod");
    cod.enabled = true;
    await cod.save();
    for (const code of STUB_PSP_CODES) {
        const stub = await PaymentGateway.findByOrFail("code", code);
        if (stub.enabled) {
            stub.enabled = false;
            await stub.save();
        }
    }
}
