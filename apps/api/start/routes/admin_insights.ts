import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminInsightsController = () => import("#controllers/admin/insights_controller");

router
    .group(() => {
        router.get("/customers", [AdminInsightsController, "customers"]).as("admin.insights.customers");
    })
    .prefix("/api/v1/admin/insights")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
