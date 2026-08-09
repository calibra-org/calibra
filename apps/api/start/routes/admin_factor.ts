import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const AdminFactorDocumentsController = () => import("#controllers/admin/factor_documents_controller");
const AdminFactorDashboardController = () => import("#controllers/admin/factor_dashboard_controller");

router
    .group(() => {
        router.get("/documents", [AdminFactorDocumentsController, "index"]).as("admin.factor.documents.index");
        router
            .post("/documents", [AdminFactorDocumentsController, "store"])
            .as("admin.factor.documents.store")
            .use(adminWriteLimiter);
        router.get("/documents/:id", [AdminFactorDocumentsController, "show"]).as("admin.factor.documents.show");
        router
            .patch("/documents/:id", [AdminFactorDocumentsController, "update"])
            .as("admin.factor.documents.update")
            .use(adminWriteLimiter);
        router
            .post("/documents/:id/transition", [AdminFactorDocumentsController, "transition"])
            .as("admin.factor.documents.transition")
            .use(adminWriteLimiter);
        router
            .post("/documents/:id/convert", [AdminFactorDocumentsController, "convert"])
            .as("admin.factor.documents.convert")
            .use(adminWriteLimiter);
        router
            .post("/documents/:id/payment-link", [AdminFactorDocumentsController, "paymentLink"])
            .as("admin.factor.documents.paymentLink")
            .use(adminWriteLimiter);
        router
            .post("/documents/:id/manual-payment", [AdminFactorDocumentsController, "manualPayment"])
            .as("admin.factor.documents.manualPayment")
            .use(adminWriteLimiter);
        router.get("/summary", [AdminFactorDashboardController, "summary"]).as("admin.factor.summary");
        router.get("/reports", [AdminFactorDashboardController, "reports"]).as("admin.factor.reports");
        router.get("/payment-attempts", [AdminFactorDashboardController, "paymentAttempts"]).as("admin.factor.paymentAttempts");
        router.get("/resources", [AdminFactorDashboardController, "resources"]).as("admin.factor.resources");
        router.get("/settings", [AdminFactorDashboardController, "settingsShow"]).as("admin.factor.settings.show");
        router
            .patch("/settings", [AdminFactorDashboardController, "settingsUpdate"])
            .as("admin.factor.settings.update")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/factor")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
