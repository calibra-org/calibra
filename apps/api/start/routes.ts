/**
 * Public route table. Versioned under `/api/v1` so we can ship breaking changes behind `/api/v2`
 * without rewriting consumer apps. Liveness probe lives at `/health` (unversioned).
 *
 * Per-domain route files live under `start/routes/` and are loaded here as the commerce backend
 * is built out — see `docs/phases/01-foundation.md`. Imports for later phases are kept here
 * (commented out) so adding a phase is a one-line uncomment instead of a merge-prone edit.
 */

import router from "@adonisjs/core/services/router";

router.get("/health", async () => ({ status: "ok" }));

await import("./routes/catalog.js");
await import("./routes/auth.js");
await import("./routes/account.js");
await import("./routes/cart.js");
await import("./routes/checkout.js");
await import("./routes/account_orders.js");
await import("./routes/admin_catalog.js");
await import("./routes/admin_customers.js");
await import("./routes/admin_orders.js");
await import("./routes/admin_coupons.js");
await import("./routes/admin_refunds.js");
await import("./routes/admin_notes.js");
await import("./routes/admin_payments.js");
await import("./routes/payment.js");
