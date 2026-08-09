import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const Controller = () => import("#controllers/admin/seo_controller");

router
    .group(() => {
        router.get("/overview", [Controller, "overview"]).as("admin.seo.overview");
        router.get("/reports", [Controller, "reports"]).as("admin.seo.reports");
        router.get("/settings", [Controller, "settingsShow"]).as("admin.seo.settings.show");
        router.patch("/settings", [Controller, "settingsUpdate"]).as("admin.seo.settings.update").use(adminWriteLimiter);

        router.get("/entities", [Controller, "entities"]).as("admin.seo.entities.index");
        router.get("/entities/:kind/:id", [Controller, "entity"]).as("admin.seo.entities.show");
        router
            .patch("/entities/:kind/:id/profile", [Controller, "profileUpdate"])
            .as("admin.seo.entities.profile.update")
            .use(adminWriteLimiter);
        router
            .post("/entities/:kind/:id/audit", [Controller, "entityAudit"])
            .as("admin.seo.entities.audit")
            .use(adminWriteLimiter);
        router.post("/audits", [Controller, "auditAll"]).as("admin.seo.audits.store").use(adminWriteLimiter);

        router.get("/issues", [Controller, "issues"]).as("admin.seo.issues.index");
        router.patch("/issues/:id/status", [Controller, "issueStatus"]).as("admin.seo.issues.status").use(adminWriteLimiter);

        router.get("/keywords", [Controller, "keywords"]).as("admin.seo.keywords.index");
        router.post("/keywords", [Controller, "keywordCreate"]).as("admin.seo.keywords.store").use(adminWriteLimiter);
        router.patch("/keywords/:id", [Controller, "keywordUpdate"]).as("admin.seo.keywords.update").use(adminWriteLimiter);
        router.delete("/keywords/:id", [Controller, "keywordDelete"]).as("admin.seo.keywords.destroy").use(adminWriteLimiter);

        router.get("/competitors", [Controller, "competitors"]).as("admin.seo.competitors.index");
        router.post("/competitors", [Controller, "competitorCreate"]).as("admin.seo.competitors.store").use(adminWriteLimiter);
        router
            .patch("/competitors/:id", [Controller, "competitorUpdate"])
            .as("admin.seo.competitors.update")
            .use(adminWriteLimiter);
        router
            .delete("/competitors/:id", [Controller, "competitorDelete"])
            .as("admin.seo.competitors.destroy")
            .use(adminWriteLimiter);

        router.get("/internal-links", [Controller, "internalLinks"]).as("admin.seo.internalLinks.index");
        router
            .post("/internal-links", [Controller, "internalLinkCreate"])
            .as("admin.seo.internalLinks.store")
            .use(adminWriteLimiter);
        router
            .patch("/internal-links/:id", [Controller, "internalLinkUpdate"])
            .as("admin.seo.internalLinks.update")
            .use(adminWriteLimiter);
        router
            .delete("/internal-links/:id", [Controller, "internalLinkDelete"])
            .as("admin.seo.internalLinks.destroy")
            .use(adminWriteLimiter);

        router.get("/redirects", [Controller, "redirects"]).as("admin.seo.redirects.index");
        router.post("/redirects", [Controller, "redirectCreate"]).as("admin.seo.redirects.store").use(adminWriteLimiter);
        router.patch("/redirects/:id", [Controller, "redirectUpdate"]).as("admin.seo.redirects.update").use(adminWriteLimiter);
        router.delete("/redirects/:id", [Controller, "redirectDelete"]).as("admin.seo.redirects.destroy").use(adminWriteLimiter);

        router.get("/integrations", [Controller, "integrations"]).as("admin.seo.integrations.index");
        router
            .patch("/integrations", [Controller, "integrationUpdate"])
            .as("admin.seo.integrations.update")
            .use(adminWriteLimiter);

        router.post("/indexnow/submit", [Controller, "indexNowSubmit"]).as("admin.seo.indexNow.submit").use(adminWriteLimiter);
        router.get("/robots/preview", [Controller, "robotsPreview"]).as("admin.seo.robots.preview");
        router.get("/sitemap/preview", [Controller, "sitemapPreview"]).as("admin.seo.sitemap.preview");
        router.get("/schema/:kind/:id", [Controller, "schemaPreview"]).as("admin.seo.schema.preview");
    })
    .prefix("/api/v1/admin/seo")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
