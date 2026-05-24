import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminProductImportsController = () => import("#controllers/admin/catalog/product_imports_controller");

/**
 * CSV product importer endpoints — every route lives under `/api/v1/admin/products/import/*` and
 * is gated by the standard admin middleware chain. Path order matters: the literal segments
 * (`/template`, `/history`, `/upload`, `/preview`, `/start`) MUST come before the `/:id` routes
 * so Adonis matches them first.
 */
router
    .group(() => {
        router.get("/template", [AdminProductImportsController, "template"]).as("admin.imports.template");
        router.get("/history", [AdminProductImportsController, "history"]).as("admin.imports.history");
        router.post("/upload", [AdminProductImportsController, "upload"]).as("admin.imports.upload");
        router.post("/preview", [AdminProductImportsController, "preview"]).as("admin.imports.preview");
        router.post("/start", [AdminProductImportsController, "start"]).as("admin.imports.start");

        router.get("/:id", [AdminProductImportsController, "show"]).as("admin.imports.show");
        router.get("/:id/stream", [AdminProductImportsController, "stream"]).as("admin.imports.stream");
        router.post("/:id/cancel", [AdminProductImportsController, "cancel"]).as("admin.imports.cancel");
        router.get("/:id/errors", [AdminProductImportsController, "errors"]).as("admin.imports.errors");
        router.post("/:id/retry-row", [AdminProductImportsController, "retryRow"]).as("admin.imports.retryRow");
        router.post("/:id/retry-failed", [AdminProductImportsController, "retryFailed"]).as("admin.imports.retryFailed");
        router.post("/:id/rollback", [AdminProductImportsController, "rollback"]).as("admin.imports.rollback");
        router.get("/:id/changes", [AdminProductImportsController, "changes"]).as("admin.imports.changes");
    })
    .prefix("/api/v1/admin/products/import")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
