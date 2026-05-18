import router from "@adonisjs/core/services/router";

const PaymentController = () => import("#controllers/payment_controller");

/**
 * Storefront payment surface.
 *
 *   POST /init               — server-to-server, called by the storefront after a pending order
 *                              is loaded and the user clicks "pay". Returns `{redirect_url}`.
 *   GET|POST /callback/:code — PSP-redirected user lands here. Always ends in a 302 to the
 *                              storefront success/failed URL — never returns JSON.
 */
router
    .group(() => {
        router.post("/init", [PaymentController, "init"]).as("payment.init");
        router.get("/callback/:gateway_code", [PaymentController, "callback"]).as("payment.callback.get");
        router.post("/callback/:gateway_code", [PaymentController, "callback"]).as("payment.callback.post");
    })
    .prefix("/api/v1/payment");
