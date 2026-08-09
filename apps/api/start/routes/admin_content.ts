import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const Controller = () => import("#controllers/admin/content_controller");

router
    .group(() => {
        router.get("/summary", [Controller, "summary"]);
        router.get("/reports", [Controller, "reports"]);
        router.get("/calendar", [Controller, "calendar"]);
        router.get("/settings", [Controller, "settingsShow"]);
        router.patch("/settings", [Controller, "settingsUpdate"]).use(adminWriteLimiter);
        router.get("/resources", [Controller, "resources"]);

        router.get("/posts", [Controller, "postsIndex"]);
        router.post("/posts", [Controller, "postsStore"]).use(adminWriteLimiter);
        router.get("/posts/:id", [Controller, "postsShow"]);
        router.patch("/posts/:id", [Controller, "postsUpdate"]).use(adminWriteLimiter);
        router.delete("/posts/:id", [Controller, "postsDestroy"]).use(adminWriteLimiter);
        router.post("/posts/:id/transition", [Controller, "postsTransition"]).use(adminWriteLimiter);
        router.get("/posts/:id/revisions", [Controller, "revisions"]);
        router.post("/posts/:id/attributions", [Controller, "attributionsStore"]).use(adminWriteLimiter);
        router.delete("/posts/:id/attributions/:orderId", [Controller, "attributionsDestroy"]).use(adminWriteLimiter);
        router.post("/posts/:postId/revisions/:revisionId/restore", [Controller, "restoreRevision"]).use(adminWriteLimiter);

        router.get("/taxonomy", [Controller, "taxonomyIndex"]);
        router.post("/taxonomy", [Controller, "taxonomyStore"]).use(adminWriteLimiter);
        router.patch("/taxonomy/:id", [Controller, "taxonomyUpdate"]).use(adminWriteLimiter);
        router.delete("/taxonomy/:id", [Controller, "taxonomyDestroy"]).use(adminWriteLimiter);

        router.get("/sources", [Controller, "sourcesIndex"]);
        router.post("/sources", [Controller, "sourcesStore"]).use(adminWriteLimiter);
        router.patch("/sources/:id", [Controller, "sourcesUpdate"]).use(adminWriteLimiter);
        router.delete("/sources/:id", [Controller, "sourcesDestroy"]).use(adminWriteLimiter);
        router.post("/sources/:id/ingest", [Controller, "sourcesIngest"]).use(adminWriteLimiter);

        router.get("/signals", [Controller, "signalsIndex"]);
        router.post("/signals", [Controller, "signalsStore"]).use(adminWriteLimiter);
        router.patch("/signals/:id/status", [Controller, "signalsStatus"]).use(adminWriteLimiter);
        router.post("/signals/:id/convert", [Controller, "signalsConvert"]).use(adminWriteLimiter);

        router.get("/agents", [Controller, "agentsIndex"]);
        router.post("/agents/run", [Controller, "agentsRun"]).use(adminWriteLimiter);
        router.get("/agents/:id", [Controller, "agentsShow"]);
        router.post("/agents/:id/review", [Controller, "agentsReview"]).use(adminWriteLimiter);
        router.post("/agents/:id/apply", [Controller, "agentsApply"]).use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/content")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
