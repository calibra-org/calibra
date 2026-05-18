import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const CheckoutDraftController = () => import("#controllers/checkout/draft_controller");
const CheckoutSubmitController = () => import("#controllers/checkout/submit_controller");
const PayLinkController = () => import("#controllers/checkout/pay_link_controller");

/**
 * Storefront checkout. All endpoints under the `cart` middleware so `ctx.cart` is resolved on
 * every request. `POST /submit` additionally runs the idempotency middleware so a replayed
 * `Idempotency-Key` short-circuits to the already-created order without re-running the finalize
 * flow.
 */
router
    .group(() => {
        router.get("/", [CheckoutDraftController, "show"]).as("checkout.show");
        router.put("/", [CheckoutDraftController, "update"]).as("checkout.update");
        router.post("/submit", [CheckoutSubmitController, "submit"]).as("checkout.submit").use(middleware.idempotency());
        router.post("/orders/:order_key/pay", [PayLinkController, "pay"]).as("checkout.pay_link");
    })
    .prefix("/api/v1/checkout")
    .use(middleware.cart());
