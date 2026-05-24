import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminCustomerMarketingController = () => import("#controllers/admin/customer_marketing_controller");
const AdminCustomerStatusController = () => import("#controllers/admin/customer_status_controller");
const AdminCustomerActionsController = () => import("#controllers/admin/customer_actions_controller");
const AdminCustomerTimelineController = () => import("#controllers/admin/customer_timeline_controller");

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
        router
            .post("/:id/convert-to-account", [AdminCustomerActionsController, "convertToAccount"])
            .as("admin.customers.convertToAccount");
        router
            .post("/:id/send-password-reset", [AdminCustomerActionsController, "sendPasswordReset"])
            .as("admin.customers.sendPasswordReset");
        router
            .post("/:id/impersonate", [AdminCustomerActionsController, "impersonate"])
            .as("admin.customers.impersonate");
        router
            .get("/:id/timeline", [AdminCustomerTimelineController, "index"])
            .as("admin.customers.timeline");
    })
    .prefix("/api/v1/admin/customers")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());

router
    .group(() => {
        router.post("/merge", [AdminCustomerActionsController, "merge"]).as("admin.customers.merge");
    })
    .prefix("/api/v1/admin/customers")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
