import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminInsightsController = () => import("#controllers/admin/insights_controller");
const AdminInsightsRegionalController = () => import("#controllers/admin/insights_regional_controller");

router
    .group(() => {
        router.get("/customers", [AdminInsightsController, "customers"]).as("admin.insights.customers");

        router
            .get("/regional/provinces", [AdminInsightsRegionalController, "provinces"])
            .as("admin.insights.regional.provinces");
        router
            .get("/regional/provinces/:code", [AdminInsightsRegionalController, "province"])
            .as("admin.insights.regional.province");
    })
    .prefix("/api/v1/admin/insights")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
