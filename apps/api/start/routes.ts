/**
 * Public route table. Versioned under `/api/v1` so we can ship breaking changes behind `/api/v2`
 * without rewriting consumer apps. Liveness probe lives at `/health` (unversioned).
 */

import router from "@adonisjs/core/services/router";

const ProductsController = () => import("#controllers/products_controller");

router.get("/health", async () => ({ status: "ok" }));

router
    .group(() => {
        router.get("/products", [ProductsController, "index"]);
        router.get("/products/:slug", [ProductsController, "show"]);
    })
    .prefix("/api/v1");
