import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminCustomerTagsController = () => import("#controllers/admin/customer_tags_controller");

router
    .group(() => {
        router.get("/customer-tags", [AdminCustomerTagsController, "index"]).as("admin.customer-tags.index");
        router.post("/customer-tags", [AdminCustomerTagsController, "store"]).as("admin.customer-tags.store");
        router.delete("/customer-tags/:id", [AdminCustomerTagsController, "destroy"]).as("admin.customer-tags.destroy");
        router.post("/customers/:id/tags", [AdminCustomerTagsController, "attach"]).as("admin.customers.tags.attach");
        router.delete("/customers/:id/tags/:tagId", [AdminCustomerTagsController, "detach"]).as("admin.customers.tags.detach");
    })
    .prefix("/api/v1/admin")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
