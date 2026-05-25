import router from "@adonisjs/core/services/router";

import { paymentLimiter, webhookLimiter } from "#start/limiter";

const PaymentController = () => import("#controllers/payment_controller");

/**
 * Storefront payment surface.
 *
 *   POST /init               — server-to-server, called by the storefront after a pending order
 *                              is loaded and the user clicks "pay". Returns `{redirect_url}`.
 *   GET|POST /callback/:code — PSP-redirected user lands here. Always ends in a 302 to the
 *                              storefront success/failed URL — never returns JSON.
 *
 * Limiter targeting:
 *   - `/init` runs under the customer-scoped {@link paymentLimiter} (30/min/user) — guards
 *     against a runaway client retrying after a flaky network drop.
 *   - `/callback/*` runs under the IP-scoped {@link webhookLimiter} (60/min/ip) — the user
 *     isn't authenticated yet at that hop, so IP is the only available key.
 */
router
    .group(() => {
        router.post("/init", [PaymentController, "init"]).as("payment.init").use(paymentLimiter);
        router.get("/callback/:gateway_code", [PaymentController, "callback"]).as("payment.callback.get").use(webhookLimiter);
        router.post("/callback/:gateway_code", [PaymentController, "callback"]).as("payment.callback.post").use(webhookLimiter);
    })
    .prefix("/api/v1/payment");
