/**
 * HTTP kernel. Registers server-level middleware (runs for every request, even unmatched routes)
 * and router-level middleware (runs only for matched routes), plus the named middleware map other
 * phases mount onto their routes.
 */

import router from "@adonisjs/core/services/router";
import server from "@adonisjs/core/services/server";

server.errorHandler(() => import("#exceptions/handler"));

server.use([
    () => import("#middleware/container_bindings_middleware"),
    () => import("#middleware/force_json_response_middleware"),
    () => import("#middleware/detect_user_locale_middleware"),
    () => import("@adonisjs/cors/cors_middleware"),
]);

router.use([() => import("@adonisjs/core/bodyparser_middleware"), () => import("@adonisjs/auth/initialize_auth_middleware")]);

export const middleware = router.named({
    auth: () => import("#middleware/auth_middleware"),
    admin: () => import("#middleware/admin_middleware"),
    cart: () => import("#middleware/cart_middleware"),
});
