# Payment Adapters

This directory holds every PSP (Payment Service Provider) adapter the platform talks to. Each adapter implements the `PaymentAdapter` contract from [`base_redirect_gateway.ts`](./base_redirect_gateway.ts); the registry in [`payment_adapter_registry.ts`](../payment_adapter_registry.ts) resolves an adapter from a gateway code at request time.

## Posture: we honestly support zero PSPs today

Five Iranian PSP gateways (`zarinpal`, `idpay`, `nextpay`, `payir`, `zibal`) are recognised by the platform — their rows are seeded into `payment_gateways`, the admin UI lists them, the registry resolves their codes — but **none of them have been validated against a real PSP sandbox**. To prevent an operator from flipping an unverified integration to `enabled = true` and routing customer funds into nothing, all five share a single class: [`unimplemented_psp_gateway.ts`](./unimplemented_psp_gateway.ts).

`UnimplementedPspGateway`:

- `init`, `verify`, `refund` — throw `GatewayNotImplementedException` (422, `E_GATEWAY_NOT_IMPLEMENTED`).
- `parseCallback` — does **not** throw; returns a synthetic failed `ParsedCallback` so a stray PSP redirect-hop produces a clean 302 to `/checkout/failed?reason=gateway_not_implemented` instead of a 500.

The seed row's `attributes.implementation_status` distinguishes adapters that are stubs from those that are real:

- `"stub"` — every PSP adapter in this repo today (the five above).
- `"live"` — `cod` and `bank_transfer`. These are offline gateways: they don't talk to any external system, treasury reconciles them by hand, and there is nothing to integrate.

The admin UI surfaces a "Not implemented" badge on stub rows, disables the enable toggle, and the admin PATCH endpoint refuses `enabled: true` on a stub. The storefront submit flow rejects stub gateways with `E_GATEWAY_NOT_IMPLEMENTED` before ever calling `adapter.init`.

## How to add a real PSP integration

Five-step recipe when a PSP integration is ready to ship:

1. **Write the adapter.** Create `<psp>_gateway.ts` in this directory, implementing the `PaymentAdapter` contract. Money stays in canonical Rial minor units (see [`base_redirect_gateway.ts`](./base_redirect_gateway.ts) for the contract); PSP-specific conversions (e.g. legacy Toman/Rial divisor on older v3 APIs) live **inside** the adapter, never at the call site. Every outbound HTTP call goes through `timeoutFetch` so the `gateway_timeout` / `gateway_unreachable` mapping in `payment_service.init` covers it.

2. **Register it.** In [`payment_adapter_registry.ts`](../payment_adapter_registry.ts), remove the entry for the PSP code from the `STUB_PSP_CAPABILITIES` array and add a `paymentAdapterRegistry.register(myGateway)` call next to `codGateway` / `bankTransferGateway`. The registered adapter's `capabilities` field is the source of truth for what the admin UI shows and what `payment_service.refund` allows.

3. **Update the seeder.** Bump the row in [`database/seed_modules/0001_foundation_seeder.ts`](../../../database/seed_modules/0001_foundation_seeder.ts):
   - flip `attributes.implementation_status` from `"stub"` to `"live"`, and
   - update `supports.refunds` to match the new adapter's capabilities.
   The seed is idempotent; re-running it propagates the flip to existing dev databases.

4. **Write a functional test.** Drop a Japa spec under [`tests/functional/payments/`](../../../tests/functional/payments/) that exercises the full storefront flow against `mockFetch`-stubbed PSP endpoints: submit → init → callback success, init failure, callback NOK, callback amount mismatch, callback replay, refund success, refund failure. The spec must call `response.assertAgainstApiSpec()` on every 2xx so OpenAPI drift is caught. The existing `cod_gateway.spec.ts` is the simplest reference; the historic `zarinpal_gateway.spec.ts` (visible in git history before this stub-out PR) is the closest reference for a redirect PSP.

5. **Smoke against a real sandbox.** A green CI suite proves the adapter speaks the contract; only a real PSP sandbox round-trip proves it speaks the actual PSP. Document the sandbox credentials handoff (1Password / Vaultwarden / wherever the agency keeps them) in the PR description so the operator can flip `enabled = true` in production with confidence.

## What the contract does and doesn't guarantee

The `PaymentAdapter` interface is intentionally narrow:

- Inputs are pre-loaded models (`Order`, `PaymentAttempt`), the decrypted settings dict, and the return URL.
- Outputs are typed result envelopes (`InitResult`, `VerifyResult`, `RefundResult`).
- Side effects (writing `payment_attempts` rows, transitioning the order, idempotency-ledger writes, Sentry breadcrumbs, metrics) all happen in `payment_service.ts` — **never** inside an adapter.

This keeps adapters small enough to fit in your head and replaceable wholesale when a PSP overhauls their API. Don't reach for `db`, `Sentry`, `emitter`, or `cache` from inside an adapter; if you find yourself wanting to, the call belongs in `payment_service.ts` instead.

## Why we ship stubs instead of half-finished integrations

Three reasons:

- **Honesty.** The admin UI shows what the platform actually does today. An operator browsing `/admin/payments` should not see a row that *looks* enabled-able when flipping that toggle would burn customer funds.
- **Architecture preservation.** The contract, the registry, and the seeded rows are exactly what a future PSP integration plugs into. Deleting them would force the next phase to reinvent the same scaffolding; keeping them lets a new integration ship behind a single PR.
- **Forensics.** Git history is the archive. `git log --follow apps/api/app/services/adapters/zarinpal_gateway.ts` from any commit on or after this phase shows the speculative integration code that was ripped out, so a future implementer has a starting point instead of a blank file.
