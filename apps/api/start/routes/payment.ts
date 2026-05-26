import router from "@adonisjs/core/services/router";

import { paymentLimiter, webhookLimiter } from "#start/limiter";

const PaymentController = () => import("#controllers/payment_controller");
const webhookSignatureMiddleware = () => import("#middleware/webhook_signature_middleware");

/**
 * Storefront payment surface.
 *
 *   POST /init               — server-to-server, called by the storefront after a pending order
 *                              is loaded and the user clicks "pay". Returns `{redirect_url}`.
 *   GET|POST /callback/:code — PSP-redirected user lands here. Always ends in a 302 to the
 *                              storefront success/failed URL — never returns JSON.
 *
 * Middleware targeting:
 *   - `/init` runs under the customer-scoped {@link paymentLimiter} (30/min/user) — guards
 *     against a runaway client retrying after a flaky network drop.
 *   - `/callback/*` runs under the IP-scoped {@link webhookLimiter} (60/min/ip) and the
 *     gateway-aware `webhookSignatureMiddleware`: the latter loads the gateway by
 *     `:gateway_code`, checks its `signed_callback` flag, and applies HMAC verification only
 *     when the PSP signs callbacks. Unsigned PSPs (ZarinPal, IDPay, …) no-op the middleware
 *     and rely on the idempotency ledger + amount guard + per-order lock for replay safety.
 */
router
    .group(() => {
        router.post("/init", [PaymentController, "init"]).as("payment.init").use(paymentLimiter);
        router
            .get("/callback/:gateway_code", [PaymentController, "callback"])
            .as("payment.callback.get")
            .use([webhookLimiter, webhookSignatureMiddleware]);
        router
            .post("/callback/:gateway_code", [PaymentController, "callback"])
            .as("payment.callback.post")
            .use([webhookLimiter, webhookSignatureMiddleware]);
    })
    .prefix("/api/v1/payment");
