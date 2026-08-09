import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@japa/runner";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const requiredAdminRoutes = [
    "/content/posts",
    "/content/market-radar",
    "/content/agents",
    "/content/studio",
    "/content/calendar",
    "/content/media",
    "/content/taxonomy",
    "/content/reports",
    "/content/settings",
];

test.group("Content OS integration contract", () => {
    for (const route of requiredAdminRoutes) {
        test(`sidebar contains ${route}`, ({ assert }) => {
            assert.include(read("apps/admin/src/components/Sidebar.tsx"), route);
        });
    }

    for (const table of [
        "content_sources",
        "content_signals",
        "content_categories",
        "content_tags",
        "content_posts",
        "content_revisions",
        "content_agent_runs",
        "content_events",
        "content_attribution_events",
    ]) {
        test(`migration creates and protects ${table}`, ({ assert }) => {
            const migration = read("apps/api/database/migrations/1750006000000_create_content_os_tables.ts");
            assert.include(migration, `createTable("${table}"`);
            assert.include(migration, `"${table}"`);
        });
    }

    for (const endpoint of [
        "/posts",
        "/taxonomy",
        "/sources",
        "/signals",
        "/agents/run",
        "/agents/:id/review",
        "/agents/:id/apply",
    ]) {
        test(`admin API exposes ${endpoint}`, ({ assert }) => {
            assert.include(read("apps/api/start/routes/admin_content.ts"), endpoint);
        });
    }

    test("public API exposes list, detail and event endpoints", ({ assert }) => {
        const routes = read("apps/api/start/routes/content_public.ts");
        assert.include(routes, "/api/v1/content/posts");
        assert.include(routes, "/api/v1/content/posts/:slug");
        assert.include(routes, "/api/v1/content/events");
    });

    test("does not expose forbidden product names in navigation", ({ assert }) => {
        const sidebar = read("apps/admin/src/components/Sidebar.tsx");
        assert.notInclude(sidebar.toLowerCase(), "lolit");
        assert.notInclude(sidebar, "کشاورز بیست");
    });
    test("Agent external request runs between short tenant transactions", ({ assert }) => {
        const job = read("apps/api/app/jobs/run_content_agent_job.ts");
        assert.isAtLeast((job.match(/withJobTenantContext/g) ?? []).length, 3);
        const execute = job.slice(job.indexOf("async execute"));
        assert.isBelow(execute.indexOf("prepareExecution"), execute.indexOf("requestExecution"));
        assert.isBelow(execute.indexOf("requestExecution"), execute.indexOf("completeExecution"));
    });

    test("source ingestion pins DNS and runs outside long tenant transactions", ({ assert }) => {
        const service = read("apps/api/app/services/content/source_ingest_service.ts");
        const job = read("apps/api/app/jobs/ingest_content_source_job.ts");
        assert.include(service, "pinnedLookup");
        assert.include(service, "source redirects are not allowed");
        assert.isAtLeast((job.match(/withJobTenantContext/g) ?? []).length, 3);
    });

    test("taxonomy UI supports parent selection and editing", ({ assert }) => {
        const page = read("apps/admin/src/features/content/taxonomy-page.tsx");
        assert.include(page, "دسته والد");
        assert.include(page, "editCategory");
        assert.include(page, "saveEditing");
    });

    test("Agent timeout covers response body parsing", ({ assert }) => {
        const service = read("apps/api/app/services/content/agent_service.ts");
        const requestStart = service.indexOf("async requestExecution");
        const requestBlock = service.slice(requestStart, service.indexOf("async completeExecution"));
        assert.include(requestBlock, "try {");
        assert.include(requestBlock, "response.json()");
        assert.include(requestBlock, "finally {");
        assert.isAbove(requestBlock.indexOf("clearTimeout(timeout)"), requestBlock.indexOf("response.json()"));
    });

    test("direct Agent publishing is rejected instead of silently stored", ({ assert }) => {
        const service = read("apps/api/app/services/content/content_service.ts");
        assert.include(service, "E_CONTENT_AGENT_DIRECT_PUBLISH_DISABLED");
        assert.notInclude(
            service.slice(service.indexOf("const types"), service.indexOf("if (payload.allow_agent_publish")),
            'allow_agent_publish: "boolean"',
        );
    });

    test("published noindex content remains publicly accessible", ({ assert }) => {
        const service = read("apps/api/app/services/content/content_service.ts");
        const publicList = service.slice(service.indexOf("async publicList"), service.indexOf("async publicDetail"));
        assert.notInclude(publicList, '.where("p.robots_index", true)');
    });

    test("storefront event proxy has an upstream timeout", ({ assert }) => {
        const route = read("apps/web/src/app/api/content/events/route.ts");
        assert.include(route, "AbortSignal.timeout(5_000)");
    });

    test("magazine search is visible and preserved in pagination", ({ assert }) => {
        const page = read("apps/web/src/app/[locale]/mag/page.tsx");
        assert.include(page, "<search>");
        assert.include(page, "encodeURIComponent(query.q)");
    });

    test("product relations use translated slugs instead of a missing products.slug column", ({ assert }) => {
        const service = read("apps/api/app/services/content/content_service.ts");
        assert.notInclude(service, '\"p.slug\", \"p.status\"');
        assert.include(service, '\"tr.slug as slug\"');
    });

    test("signal conversion fixture clears the configured trust gate", ({ assert }) => {
        const spec = read("apps/api/tests/functional/admin/content.spec.ts");
        assert.include(spec, "source_trust_score: 80");
    });
});
