import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const Controller = () => import("#controllers/admin/content_controller");

router
    .group(() => {
        router.get("/summary", [Controller, "summary"]).as("admin.content.summary");
        router.get("/reports", [Controller, "reports"]).as("admin.content.reports");
        router.get("/calendar", [Controller, "calendar"]).as("admin.content.calendar");
        router.get("/settings", [Controller, "settingsShow"]).as("admin.content.settings.show");
        router.patch("/settings", [Controller, "settingsUpdate"]).as("admin.content.settings.update").use(adminWriteLimiter);
        router.get("/resources", [Controller, "resources"]).as("admin.content.resources");

        router.get("/posts", [Controller, "postsIndex"]).as("admin.content.posts.index");
        router.post("/posts", [Controller, "postsStore"]).as("admin.content.posts.store").use(adminWriteLimiter);
        router.get("/posts/:id", [Controller, "postsShow"]).as("admin.content.posts.show");
        router.patch("/posts/:id", [Controller, "postsUpdate"]).as("admin.content.posts.update").use(adminWriteLimiter);
        router.delete("/posts/:id", [Controller, "postsDestroy"]).as("admin.content.posts.destroy").use(adminWriteLimiter);
        router
            .post("/posts/:id/transition", [Controller, "postsTransition"])
            .as("admin.content.posts.transition")
            .use(adminWriteLimiter);
        router.get("/posts/:id/revisions", [Controller, "revisions"]).as("admin.content.posts.revisions");
        router
            .post("/posts/:id/attributions", [Controller, "attributionsStore"])
            .as("admin.content.posts.attributions.store")
            .use(adminWriteLimiter);
        router
            .delete("/posts/:id/attributions/:orderId", [Controller, "attributionsDestroy"])
            .as("admin.content.posts.attributions.destroy")
            .use(adminWriteLimiter);
        router
            .post("/posts/:postId/revisions/:revisionId/restore", [Controller, "restoreRevision"])
            .as("admin.content.posts.revisions.restore")
            .use(adminWriteLimiter);

        router.get("/taxonomy", [Controller, "taxonomyIndex"]).as("admin.content.taxonomy.index");
        router.post("/taxonomy", [Controller, "taxonomyStore"]).as("admin.content.taxonomy.store").use(adminWriteLimiter);
        router.patch("/taxonomy/:id", [Controller, "taxonomyUpdate"]).as("admin.content.taxonomy.update").use(adminWriteLimiter);
        router
            .delete("/taxonomy/:id", [Controller, "taxonomyDestroy"])
            .as("admin.content.taxonomy.destroy")
            .use(adminWriteLimiter);

        router.get("/sources", [Controller, "sourcesIndex"]).as("admin.content.sources.index");
        router.post("/sources", [Controller, "sourcesStore"]).as("admin.content.sources.store").use(adminWriteLimiter);
        router.patch("/sources/:id", [Controller, "sourcesUpdate"]).as("admin.content.sources.update").use(adminWriteLimiter);
        router.delete("/sources/:id", [Controller, "sourcesDestroy"]).as("admin.content.sources.destroy").use(adminWriteLimiter);
        router
            .post("/sources/:id/ingest", [Controller, "sourcesIngest"])
            .as("admin.content.sources.ingest")
            .use(adminWriteLimiter);

        router.get("/signals", [Controller, "signalsIndex"]).as("admin.content.signals.index");
        router.post("/signals", [Controller, "signalsStore"]).as("admin.content.signals.store").use(adminWriteLimiter);
        router
            .patch("/signals/:id/status", [Controller, "signalsStatus"])
            .as("admin.content.signals.status")
            .use(adminWriteLimiter);
        router
            .post("/signals/:id/convert", [Controller, "signalsConvert"])
            .as("admin.content.signals.convert")
            .use(adminWriteLimiter);

        router.get("/agents", [Controller, "agentsIndex"]).as("admin.content.agents.index");
        router.post("/agents/run", [Controller, "agentsRun"]).as("admin.content.agents.run").use(adminWriteLimiter);
        router.get("/agents/:id", [Controller, "agentsShow"]).as("admin.content.agents.show");
        router.post("/agents/:id/review", [Controller, "agentsReview"]).as("admin.content.agents.review").use(adminWriteLimiter);
        router.post("/agents/:id/apply", [Controller, "agentsApply"]).as("admin.content.agents.apply").use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/content")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
