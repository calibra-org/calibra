import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminCustomerSegmentsController = () => import("#controllers/admin/customer_segments_controller");

router
    .group(() => {
        router.get("/", [AdminCustomerSegmentsController, "index"]).as("admin.customer-segments.index");
        router.post("/", [AdminCustomerSegmentsController, "store"]).as("admin.customer-segments.store");
        router.patch("/:id", [AdminCustomerSegmentsController, "update"]).as("admin.customer-segments.update");
        router.delete("/:id", [AdminCustomerSegmentsController, "destroy"]).as("admin.customer-segments.destroy");
    })
    .prefix("/api/v1/admin/customer-segments")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
