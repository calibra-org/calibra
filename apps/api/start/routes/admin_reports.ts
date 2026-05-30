import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminReportsController = () => import("#controllers/admin/reports_controller");

router
    .group(() => {
        router.get("/top-products", [AdminReportsController, "topProducts"]).as("admin.reports.top_products");
        router.get("/top-categories", [AdminReportsController, "topCategories"]).as("admin.reports.top_categories");
        router.get("/sales-stats", [AdminReportsController, "salesStats"]).as("admin.reports.sales_stats");
        router.get("/coupons-stats", [AdminReportsController, "couponsStats"]).as("admin.reports.coupons_stats");
        router.get("/revenue", [AdminReportsController, "revenueTable"]).as("admin.reports.revenue");
        router.get("/orders", [AdminReportsController, "ordersTable"]).as("admin.reports.orders");
        router.get("/products", [AdminReportsController, "productsTable"]).as("admin.reports.products");
        router.get("/categories", [AdminReportsController, "categoriesTable"]).as("admin.reports.categories");
        router.get("/coupons", [AdminReportsController, "couponsTable"]).as("admin.reports.coupons");
        router.get("/taxes", [AdminReportsController, "taxesTable"]).as("admin.reports.taxes");
        router.get("/stock", [AdminReportsController, "stockReport"]).as("admin.reports.stock");
    })
    .prefix("/api/v1/admin/reports")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
