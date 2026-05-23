/**
 * Public route table. Versioned under `/api/v1` so breaking changes can ship behind `/api/v2`
 * without rewriting consumer apps. Liveness probe lives at `/health` (unversioned).
 *
 * Per-domain route files live under `start/routes/`; this module imports each one so the registry
 * is fully populated before AdonisJS boots the HTTP server.
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
await import("./routes/admin_reports.js");
await import("./routes/admin_media.js");
await import("./routes/uploads.js");
await import("./routes/payment.js");
