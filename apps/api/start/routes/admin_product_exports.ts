import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminProductExportsController = () => import("#controllers/admin/catalog/product_exports_controller");

/**
 * CSV product exporter endpoints. All gated by the standard admin middleware chain. Path order
 * matters — literal segments (`/count`, `/preview`, `/start`, `/history`, `/presets`, …) MUST
 * come before the `/:id` routes so Adonis matches them first.
 *
 * Live progress is delivered via `@adonisjs/transmit` (channel `exports/:id`) — see
 * `start/transmit.ts`. There is no `/stream` route here anymore.
 */
router
    .group(() => {
        router.get("/count", [AdminProductExportsController, "count"]).as("admin.exports.count");
        router.get("/preview", [AdminProductExportsController, "preview"]).as("admin.exports.preview");
        router.post("/start", [AdminProductExportsController, "start"]).as("admin.exports.start");
        router.get("/history", [AdminProductExportsController, "history"]).as("admin.exports.history");

        router.get("/presets", [AdminProductExportsController, "listPresets"]).as("admin.exports.presets.index");
        router.post("/presets", [AdminProductExportsController, "createPreset"]).as("admin.exports.presets.store");
        router.patch("/presets/:id", [AdminProductExportsController, "updatePreset"]).as("admin.exports.presets.update");
        router.delete("/presets/:id", [AdminProductExportsController, "destroyPreset"]).as("admin.exports.presets.destroy");

        router.get("/:id", [AdminProductExportsController, "show"]).as("admin.exports.show");
        router.post("/:id/cancel", [AdminProductExportsController, "cancel"]).as("admin.exports.cancel");
        router.get("/:id/download", [AdminProductExportsController, "download"]).as("admin.exports.download");
        router.delete("/:id", [AdminProductExportsController, "destroy"]).as("admin.exports.destroy");
    })
    .prefix("/api/v1/admin/products/export")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());

/**
 * `/distinct-meta-keys` is a sibling endpoint that doesn't fit under `/export/*` — it lives
 * directly under `/products/distinct-meta-keys` so the wizard's meta multi-select can fetch
 * keys without confusing the path matcher's `:id` capture.
 */
router
    .group(() => {
        router
            .get("/distinct-meta-keys", [AdminProductExportsController, "distinctMetaKeys"])
            .as("admin.products.distinctMetaKeys");
    })
    .prefix("/api/v1/admin/products")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
