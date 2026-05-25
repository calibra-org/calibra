import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { authLimiter, loginEmailLimiter } from "#start/limiter";

const RegisterController = () => import("#controllers/auth/register_controller");
const LoginController = () => import("#controllers/auth/login_controller");
const LogoutController = () => import("#controllers/auth/logout_controller");
const PasswordForgotController = () => import("#controllers/auth/password_forgot_controller");
const PasswordResetController = () => import("#controllers/auth/password_reset_controller");
const MeController = () => import("#controllers/account/me_controller");

router
    .group(() => {
        router.post("/register", [RegisterController, "handle"]).as("auth.register").use(authLimiter);
        router.post("/login", [LoginController, "handle"]).as("auth.login").use([authLimiter, loginEmailLimiter]);
        router.post("/password/forgot", [PasswordForgotController, "handle"]).as("auth.password.forgot").use(authLimiter);
        router.post("/password/reset", [PasswordResetController, "handle"]).as("auth.password.reset").use(authLimiter);

        router
            .group(() => {
                router.post("/logout", [LogoutController, "handle"]).as("auth.logout");
                router.get("/me", [MeController, "show"]).as("auth.me");
            })
            .use(middleware.auth({ guards: ["api"] }));
    })
    .prefix("/api/v1/auth");
