import router from "@adonisjs/core/services/router";

import { contentPublicLimiter } from "#start/limiter";

const Controller = () => import("#controllers/content/public_content_controller");

router.get("/api/v1/content/posts", [Controller, "index"]);
router.get("/api/v1/content/posts/:slug", [Controller, "show"]);
router.post("/api/v1/content/events", [Controller, "event"]).use(contentPublicLimiter);
