import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminOrdersController = () => import("#controllers/admin/orders_controller");

router
    .group(() => {
        router.get("/", [AdminOrdersController, "index"]).as("admin.orders.index");
        router.get("/counts", [AdminOrdersController, "counts"]).as("admin.orders.counts");
        router.post("/", [AdminOrdersController, "store"]).as("admin.orders.store");
        router.post("/batch", [AdminOrdersController, "batch"]).as("admin.orders.batch");
        router.get("/:id", [AdminOrdersController, "show"]).as("admin.orders.show");
        router.patch("/:id", [AdminOrdersController, "update"]).as("admin.orders.update");
        router.put("/:id", [AdminOrdersController, "update"]).as("admin.orders.put");
        router.delete("/:id", [AdminOrdersController, "destroy"]).as("admin.orders.destroy");
        router.post("/:id/status", [AdminOrdersController, "transitionStatus"]).as("admin.orders.status");
        router.post("/:id/mark-shipped", [AdminOrdersController, "markShipped"]).as("admin.orders.markShipped");
        router
            .post("/:id/resend-confirmation", [AdminOrdersController, "resendConfirmation"])
            .as("admin.orders.resendConfirmation");
    })
    .prefix("/api/v1/admin/orders")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
