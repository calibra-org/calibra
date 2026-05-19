import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const RefundsController = () => import("#controllers/admin/refunds_controller");

router
    .group(() => {
        router.get("/", [RefundsController, "index"]).as("admin.orders.refunds.index");
        router.get("/:id", [RefundsController, "show"]).as("admin.orders.refunds.show");
        router.post("/", [RefundsController, "store"]).as("admin.orders.refunds.store");
        router.delete("/:id", [RefundsController, "destroy"]).as("admin.orders.refunds.destroy");
    })
    .prefix("/api/v1/admin/orders/:order_id/refunds")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
