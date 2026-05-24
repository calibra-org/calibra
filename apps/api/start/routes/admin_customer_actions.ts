import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminCustomerMarketingController = () => import("#controllers/admin/customer_marketing_controller");
const AdminCustomerStatusController = () => import("#controllers/admin/customer_status_controller");

router
    .group(() => {
        router
            .get("/:id/marketing", [AdminCustomerMarketingController, "show"])
            .as("admin.customers.marketing.show");
        router
            .patch("/:id/marketing", [AdminCustomerMarketingController, "update"])
            .as("admin.customers.marketing.update");
        router
            .get("/:id/marketing/history", [AdminCustomerMarketingController, "history"])
            .as("admin.customers.marketing.history");
        router
            .patch("/:id/status", [AdminCustomerStatusController, "update"])
            .as("admin.customers.status.update");
        router
            .get("/:id/status-history", [AdminCustomerStatusController, "history"])
            .as("admin.customers.status.history");
    })
    .prefix("/api/v1/admin/customers")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
