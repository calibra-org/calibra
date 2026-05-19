import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminReportsController = () => import("#controllers/admin/reports_controller");

router
    .group(() => {
        router.get("/top-products", [AdminReportsController, "topProducts"]).as("admin.reports.top_products");
    })
    .prefix("/api/v1/admin/reports")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
