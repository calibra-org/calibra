import router from "@adonisjs/core/services/router";

const Controller = () => import("#controllers/seo_public_controller");

router.get("/api/v1/seo/robots", [Controller, "robots"]);
router.get("/api/v1/seo/sitemap.xml", [Controller, "sitemap"]);
router.get("/api/v1/seo/organization", [Controller, "organization"]);
router.get("/api/v1/seo/entity/:kind/:id", [Controller, "entity"]);
router.get("/api/v1/seo/redirect", [Controller, "redirect"]);
