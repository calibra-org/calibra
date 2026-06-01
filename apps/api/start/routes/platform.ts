import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { authLimiter } from "#start/limiter";

/**
 * Control-plane (platform) routes. Global — `tenant_context_middleware` skips `/api/v1/platform/*`,
 * so these run without a tenant context. Auth uses the dedicated `platform` guard (separate
 * `platform_access_tokens` table); a shopper/shop token can never authenticate here.
 */
const PlatformLoginController = () => import("#controllers/platform/platform_login_controller");
const ImpersonationController = () => import("#controllers/platform/impersonation_controller");

router
    .group(() => {
        router.post("/auth/login", [PlatformLoginController, "handle"]).as("platform.auth.login").use(authLimiter);

        router
            .group(() => {
                router
                    .post("/tenants/:id/impersonate", [ImpersonationController, "start"])
                    .as("platform.tenants.impersonate");
            })
            .use(middleware.platformAuth());
    })
    .prefix("/api/v1/platform");
