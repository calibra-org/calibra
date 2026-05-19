import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminPaymentGatewaysController = () => import("#controllers/admin/payment_gateways_controller");
const AdminPaymentAttemptsController = () => import("#controllers/admin/payment_attempts_controller");

router
    .group(() => {
        router.get("/payment-gateways", [AdminPaymentGatewaysController, "index"]).as("admin.payment_gateways.index");
        router.get("/payment-gateways/:id", [AdminPaymentGatewaysController, "show"]).as("admin.payment_gateways.show");
        router.patch("/payment-gateways/:id", [AdminPaymentGatewaysController, "update"]).as("admin.payment_gateways.update");

        router.get("/payment-attempts", [AdminPaymentAttemptsController, "index"]).as("admin.payment_attempts.index");
        router.get("/payment-attempts/:id", [AdminPaymentAttemptsController, "show"]).as("admin.payment_attempts.show");
    })
    .prefix("/api/v1/admin")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
