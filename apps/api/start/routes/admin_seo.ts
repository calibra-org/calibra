import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const Controller = () => import("#controllers/admin/seo_controller");

router
    .group(() => {
        router.get("/overview", [Controller, "overview"]);
        router.get("/reports", [Controller, "reports"]);
        router.get("/settings", [Controller, "settingsShow"]);
        router.patch("/settings", [Controller, "settingsUpdate"]).use(adminWriteLimiter);

        router.get("/entities", [Controller, "entities"]);
        router.get("/entities/:kind/:id", [Controller, "entity"]);
        router.patch("/entities/:kind/:id/profile", [Controller, "profileUpdate"]).use(adminWriteLimiter);
        router.post("/entities/:kind/:id/audit", [Controller, "entityAudit"]).use(adminWriteLimiter);
        router.post("/audits", [Controller, "auditAll"]).use(adminWriteLimiter);

        router.get("/issues", [Controller, "issues"]);
        router.patch("/issues/:id/status", [Controller, "issueStatus"]).use(adminWriteLimiter);

        router.get("/keywords", [Controller, "keywords"]);
        router.post("/keywords", [Controller, "keywordCreate"]).use(adminWriteLimiter);
        router.patch("/keywords/:id", [Controller, "keywordUpdate"]).use(adminWriteLimiter);
        router.delete("/keywords/:id", [Controller, "keywordDelete"]).use(adminWriteLimiter);

        router.get("/competitors", [Controller, "competitors"]);
        router.post("/competitors", [Controller, "competitorCreate"]).use(adminWriteLimiter);
        router.patch("/competitors/:id", [Controller, "competitorUpdate"]).use(adminWriteLimiter);
        router.delete("/competitors/:id", [Controller, "competitorDelete"]).use(adminWriteLimiter);

        router.get("/internal-links", [Controller, "internalLinks"]);
        router.post("/internal-links", [Controller, "internalLinkCreate"]).use(adminWriteLimiter);
        router.patch("/internal-links/:id", [Controller, "internalLinkUpdate"]).use(adminWriteLimiter);
        router.delete("/internal-links/:id", [Controller, "internalLinkDelete"]).use(adminWriteLimiter);

        router.get("/redirects", [Controller, "redirects"]);
        router.post("/redirects", [Controller, "redirectCreate"]).use(adminWriteLimiter);
        router.patch("/redirects/:id", [Controller, "redirectUpdate"]).use(adminWriteLimiter);
        router.delete("/redirects/:id", [Controller, "redirectDelete"]).use(adminWriteLimiter);

        router.get("/integrations", [Controller, "integrations"]);
        router.patch("/integrations", [Controller, "integrationUpdate"]).use(adminWriteLimiter);

        router.post("/indexnow/submit", [Controller, "indexNowSubmit"]).use(adminWriteLimiter);
        router.get("/robots/preview", [Controller, "robotsPreview"]);
        router.get("/sitemap/preview", [Controller, "sitemapPreview"]);
        router.get("/schema/:kind/:id", [Controller, "schemaPreview"]);
    })
    .prefix("/api/v1/admin/seo")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
