#!/usr/bin/env node

import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.resolve(new URL("..", import.meta.url).pathname);
let checks = 0;
const failures = [];

function check(condition, message) {
    checks += 1;
    if (!condition) failures.push(message);
}

function read(relative) {
    return fs.readFileSync(path.join(root, relative), "utf8");
}

function exists(relative) {
    return fs.existsSync(path.join(root, relative));
}

function contains(relative, needle, message = `${relative} must contain ${needle}`) {
    check(read(relative).includes(needle), message);
}

function notContains(relative, needle, message = `${relative} must not contain ${needle}`) {
    check(!read(relative).includes(needle), message);
}

function compileModule(relative, outDir) {
    const source = read(relative);
    const result = ts.transpileModule(source, {
        fileName: relative,
        reportDiagnostics: true,
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.NodeNext,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true,
        },
    });
    const errors = (result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
    check(
        errors.length === 0,
        `${relative} has TypeScript syntax diagnostics: ${errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, " ")).join(" | ")}`,
    );
    const output = path.join(outDir, `${path.basename(relative).replace(/\.(tsx?|mts)$/, "")}.cjs`);
    fs.writeFileSync(output, result.outputText);
    return output;
}

const routeModes = [
    "overview",
    "control-tower",
    "products",
    "categories-links",
    "images-alt",
    "schema-preview",
    "keywords-content",
    "content-refresh",
    "live-editor",
    "market-radar",
    "technical-health",
    "crawl-monitoring",
    "rank-tracking",
    "competitors-serp",
    "reports",
    "settings",
];

const requiredFiles = [
    "apps/api/database/migrations/1750007000000_create_seo_os_tables.ts",
    "apps/api/app/services/seo/domain.ts",
    "apps/api/app/services/seo/analyzer.ts",
    "apps/api/app/services/seo/builders.ts",
    "apps/api/app/services/seo/seo_service.ts",
    "apps/api/app/controllers/admin/seo_controller.ts",
    "apps/api/app/controllers/seo_public_controller.ts",
    "apps/api/app/validators/admin/seo_validator.ts",
    "apps/api/start/routes/admin_seo.ts",
    "apps/api/start/routes/seo_public.ts",
    "apps/api/tests/unit/seo/domain.spec.ts",
    "apps/admin/src/features/seo/types.ts",
    "apps/admin/src/features/seo/queries.ts",
    "apps/admin/src/features/seo/workspace.tsx",
    "apps/web/src/lib/seo-api.ts",
    "apps/web/src/app/robots.txt/route.ts",
    "apps/web/src/app/sitemap.xml/route.ts",
    "apps/web/src/app/[locale]/[...path]/route.ts",
    "docs/seo-integration/SEO_MASTER_PROMPT_FA.md",
    "docs/seo-integration/SEO_ARCHITECTURE_FA.md",
];
for (const file of requiredFiles) check(exists(file), `Missing required file: ${file}`);

for (const mode of routeModes) {
    const file = `apps/admin/src/app/[locale]/(authenticated)/seo/${mode}/page.tsx`;
    check(exists(file), `Missing admin SEO route: ${file}`);
    if (exists(file)) {
        contains(file, "SeoWorkspaceView", `${file} must render SeoWorkspaceView`);
        contains(file, `mode="${mode}"`, `${file} must bind mode ${mode}`);
    }
}

const sidebar = read("apps/admin/src/components/Sidebar.tsx");
for (const mode of routeModes) check(sidebar.includes(`/seo/${mode}`), `Sidebar missing /seo/${mode}`);
check(sidebar.indexOf("contentItems") < sidebar.indexOf("seoItems"), "Posts menu must be declared before SEO");
check(
    sidebar.indexOf("aria-expanded={factorOpen}") < sidebar.indexOf("aria-expanded={contentOpen}"),
    "Factor menu must render before Posts",
);
check(
    sidebar.indexOf("aria-expanded={contentOpen}") < sidebar.indexOf("aria-expanded={seoOpen}"),
    "Posts menu must render before SEO",
);
contains("apps/admin/src/components/Sidebar.tsx", "setSeoOpen", "SEO menu must be collapsible");
contains("apps/admin/src/components/Sidebar.tsx", "seoActive", "SEO menu must follow active route");

const forbiddenUiFiles = [
    "apps/admin/src/components/Sidebar.tsx",
    "apps/admin/src/features/seo/workspace.tsx",
    "apps/admin/messages/fa.json",
    "apps/admin/messages/en.json",
];
for (const file of forbiddenUiFiles) {
    notContains(file, "Lolit", `${file} exposes forbidden prototype name`);
    notContains(file, "lolit", `${file} exposes forbidden prototype slug`);
    notContains(file, "کشاورز بیست", `${file} exposes store brand in generic admin UI`);
}
notContains("apps/admin/src/features/seo/workspace.tsx", "Mock", "Runtime UI must not claim Mock data");
contains("apps/admin/src/features/seo/workspace.tsx", "داده واقعی کالیبرا", "Runtime UI must identify real Calibra data");
contains("apps/admin/src/features/seo/workspace.tsx", "اثر واقعی نوشته‌ها بر فروش");
contains("apps/admin/src/features/seo/workspace.tsx", "content_impact");

const tables = [
    "seo_entity_profiles",
    "seo_audit_runs",
    "seo_issues",
    "seo_keywords",
    "seo_competitors",
    "seo_internal_links",
    "seo_redirects",
    "seo_integrations",
    "seo_events",
];
const migrationFile = "apps/api/database/migrations/1750007000000_create_seo_os_tables.ts";
for (const table of tables) {
    contains(migrationFile, `createTable("${table}"`, `Migration must create ${table}`);
    contains(migrationFile, `"${table}"`, `Tenant table registry must include ${table}`);
}
const tableToken = ["$", "{table}"].join("");
contains(migrationFile, `ALTER TABLE ${tableToken} ENABLE ROW LEVEL SECURITY`, "Tenant table loop must enable RLS");
contains(migrationFile, `ALTER TABLE ${tableToken} FORCE ROW LEVEL SECURITY`, "Tenant table loop must force RLS");
contains(migrationFile, `CREATE POLICY tenant_isolation ON ${tableToken}`, "Tenant table loop must create tenant policy");
contains(
    migrationFile,
    "for (const table of tables) this.schema.dropTable(table)",
    "Migration down must drop every registered table",
);
for (const code of [301, 302, 307, 308, 410]) contains(migrationFile, String(code), `Redirect status ${code} must be allowed`);
for (const profile of ["k20", "k21"]) contains(migrationFile, `'${profile}'`, `Migration must constrain ${profile}`);
for (const provider of [
    "google_search_console",
    "bing_webmaster",
    "indexnow",
    "google_merchant",
    "openai_searchbot",
    "manual_import",
])
    contains(migrationFile, `'${provider}'`, `Migration missing provider ${provider}`);

const adminRoutes = read("apps/api/start/routes/admin_seo.ts");
const expectedAdminEndpoints = [
    "/overview",
    "/reports",
    "/entities",
    "/entities/:kind/:id",
    "/entities/:kind/:id/profile",
    "/entities/:kind/:id/audit",
    "/audits",
    "/issues",
    "/issues/:id/status",
    "/keywords",
    "/keywords/:id",
    "/competitors",
    "/competitors/:id",
    "/internal-links",
    "/internal-links/:id",
    "/redirects",
    "/redirects/:id",
    "/settings",
    "/integrations",
    "/indexnow/submit",
    "/robots/preview",
    "/sitemap/preview",
    "/schema/:kind/:id",
];
for (const endpoint of expectedAdminEndpoints) check(adminRoutes.includes(endpoint), `Admin API route missing ${endpoint}`);
contains("apps/api/start/routes.ts", "./routes/admin_seo.js");
contains("apps/api/start/routes.ts", "./routes/seo_public.js");
for (const endpoint of ["/robots", "/sitemap.xml", "/organization", "/entity/:kind/:id", "/redirect"])
    contains("apps/api/start/routes/seo_public.ts", endpoint);

const serviceFile = "apps/api/app/services/seo/seo_service.ts";
for (const table of [
    "products",
    "product_attributes",
    "content_posts",
    "media",
    "seo_keywords",
    "seo_competitors",
    "seo_internal_links",
    "seo_redirects",
])
    contains(serviceFile, `.from("${table}`, `Service must read ${table}`);
for (const table of ["product_categories", "product_brands"])
    contains(serviceFile, `"${table}"`, `Service taxonomy registry must include ${table}`);
for (const counter of ["views_count", "product_clicks_count", "assisted_orders_count", "assisted_revenue_minor"])
    contains(serviceFile, counter, `Service must expose content commerce counter ${counter}`);
contains(serviceFile, 'this.sitemapEntries("fa")', "Sitemap/IndexNow must include Persian locale");
contains(serviceFile, 'this.sitemapEntries("en")', "Sitemap/IndexNow must include English locale");
contains(serviceFile, 'locale === "fa" ? "/fa" : ""', "Public path locale prefix must match as-needed routing");
contains("apps/api/app/controllers/seo_public_controller.ts", 'seoService.sitemapEntries("fa")');
contains("apps/api/app/controllers/seo_public_controller.ts", 'seoService.sitemapEntries("en")');

for (const route of [
    "apps/web/src/app/robots.txt/route.ts",
    "apps/web/src/app/sitemap.xml/route.ts",
    "apps/web/src/app/[locale]/[...path]/route.ts",
]) {
    contains(route, "export async function GET");
    contains(route, "export const HEAD = GET;");
}
contains("apps/web/src/app/robots.txt/route.ts", "/api/v1/seo/robots");
contains("apps/web/src/app/sitemap.xml/route.ts", "/api/v1/seo/sitemap.xml");
contains("apps/web/src/app/[locale]/[...path]/route.ts", 'locale === "fa" ? "/fa" : ""');
for (const page of ["apps/web/src/app/[locale]/products/[slug]/page.tsx", "apps/web/src/app/[locale]/mag/[slug]/page.tsx"]) {
    contains(page, "getPublicSeoEntity", `${page} must consume public SEO API`);
}
for (const page of ["apps/web/src/app/[locale]/categories/[slug]/page.tsx", "apps/web/src/app/[locale]/brands/[slug]/page.tsx"]) {
    contains(page, "TaxonomyPage", `${page} must delegate to the shared SEO-aware taxonomy page`);
}
contains(
    "apps/web/src/components/catalog/taxonomy-page.tsx",
    "getPublicSeoEntity",
    "Shared taxonomy page must consume public SEO API",
);
contains("apps/web/src/app/[locale]/layout.tsx", "getPublicOrganization");
contains("apps/web/src/app/[locale]/layout.tsx", "application/ld+json");
contains("apps/admin/src/features/content/studio-page.tsx", "SEO");
contains("apps/admin/src/views/products/detail/product-detail.tsx", "/seo/live-editor");

for (const apiSpec of ["docs/api/reference/openapi/admin.v1.yaml", "docs/api/reference/openapi/storefront.v1.yaml"]) {
    contains(apiSpec, "/seo/", `${apiSpec} must document SEO API`);
}

for (const file of [
    "apps/admin/messages/fa.json",
    "apps/admin/messages/en.json",
    "apps/web/messages/fa.json",
    "apps/web/messages/en.json",
]) {
    try {
        const value = JSON.parse(read(file));
        check(Boolean(value && typeof value === "object"), `${file} must contain a JSON object`);
    } catch (error) {
        check(false, `${file} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
}
for (const file of ["docs/api/reference/openapi/admin.v1.yaml", "docs/api/reference/openapi/storefront.v1.yaml"]) {
    const source = read(file);
    check(/^openapi:\s*3\./m.test(source), `${file} must declare OpenAPI 3`);
    check(/^paths:/m.test(source), `${file} must declare paths`);
    check(source.includes("/seo/"), `${file} must document SEO paths`);
}

const scanRoots = ["apps/api", "apps/admin", "apps/web"];
const sourceFiles = [];
for (const scanRoot of scanRoots) {
    const absolute = path.join(root, scanRoot);
    const walk = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (["node_modules", ".next", ".turbo"].includes(entry.name)) continue;
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (
                /\.(ts|tsx)$/.test(entry.name) &&
                (full.includes(`${path.sep}seo${path.sep}`) || entry.name.includes("seo") || full.endsWith("Sidebar.tsx"))
            )
                sourceFiles.push(full);
        }
    };
    walk(absolute);
}
const extraSourceFiles = [
    "apps/api/start/routes.ts",
    "apps/admin/src/features/content/studio-page.tsx",
    "apps/admin/src/views/products/detail/product-detail.tsx",
    "apps/web/src/components/catalog/taxonomy-page.tsx",
    "apps/web/src/components/content/product-content-link.tsx",
    "apps/web/src/app/[locale]/layout.tsx",
    "apps/web/src/app/[locale]/products/page.tsx",
    "apps/web/src/app/[locale]/categories/[slug]/page.tsx",
    "apps/web/src/app/[locale]/brands/[slug]/page.tsx",
    "apps/web/src/app/[locale]/products/[slug]/page.tsx",
    "apps/web/src/app/[locale]/mag/[slug]/page.tsx",
];
for (const relative of extraSourceFiles) {
    const full = path.join(root, relative);
    if (fs.existsSync(full) && !sourceFiles.includes(full)) sourceFiles.push(full);
}
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "calibra-seo-verify-"));
for (const full of sourceFiles) compileModule(path.relative(root, full), tempDir);

const domainOut = compileModule("apps/api/app/services/seo/domain.ts", tempDir);
const analyzerOut = compileModule("apps/api/app/services/seo/analyzer.ts", tempDir);
const buildersOut = compileModule("apps/api/app/services/seo/builders.ts", tempDir);
const domain = require(domainOut);
const analyzer = require(analyzerOut);
const builders = require(buildersOut);

check(domain.SEO_ENTITY_KINDS.length === 7, "Entity kind registry must have seven kinds");
check(domain.SEO_ENGINE_PROFILES.join(",") === "k20,k21", "Engine profiles must be K20 and K21");
check(domain.DEFAULT_SEO_SETTINGS.robots_enabled === true, "Robots must default enabled");
check(domain.DEFAULT_SEO_SETTINGS.sitemap_enabled === true, "Sitemap must default enabled");
check(domain.DEFAULT_SEO_SETTINGS.schema_enabled === true, "Schema must default enabled");
check(domain.DEFAULT_SEO_SETTINGS.indexnow_enabled === false, "IndexNow must require explicit enablement");

const completeProduct = {
    kind: "product",
    key: "product:1",
    id: 1,
    locale: "fa",
    publicUrl: "https://example.com/fa/products/demo-product",
    title: "محصول نمونه کامل برای بررسی موتور سئو کالیبرا",
    slug: "demo-product",
    shortDescription:
        "این توضیح کوتاه، روشن و کافی برای آزمایش موتور تحلیل سئو در پنل مدیریت کالیبرا نوشته شده است و طول مناسبی دارد.",
    description: `<p>${"توضیح کامل و معتبر محصول ".repeat(70)}</p>`,
    status: "publish",
    sku: "SKU-1",
    gtin: "1234567890123",
    brandCount: 1,
    brandName: "Demo",
    categoryCount: 1,
    categoryNames: ["Demo"],
    attributeCount: 5,
    imageCount: 3,
    imageAltCount: 3,
    imageUrls: ["https://example.com/a.webp"],
    priceMinor: 100000,
    stockStatus: "instock",
    internalInboundCount: 2,
    internalOutboundCount: 4,
    profile: {
        metaTitle: "محصول نمونه کامل برای تست سئو و داده ساختاریافته",
        metaDescription:
            "توضیح متای کامل و مستقل برای محصول نمونه که هدف صفحه را روشن می‌کند و برای بررسی خودکار طول و کیفیت فیلدهای سئو در کالیبرا استفاده می‌شود.",
        focusKeyword: "محصول نمونه",
        canonicalUrl: "https://example.com/fa/products/demo-product",
        robotsIndex: true,
        robotsFollow: true,
        schemaType: "Product",
    },
};

for (const profile of ["k20", "k21"]) {
    const result = analyzer.analyzeSeoEvidence(completeProduct, profile);
    check(result.total >= 80 && result.total <= 100, `${profile} complete product score must be healthy`);
    for (const component of ["technical", "content", "schema", "media", "commerce"])
        check(result[component] >= 0 && result[component] <= 100, `${profile} ${component} score must be bounded`);
    check(Array.isArray(result.issues), `${profile} issues must be an array`);
}

const kinds = domain.SEO_ENTITY_KINDS;
const statuses = ["draft", "publish", "published"];
for (let index = 0; index < 48; index += 1) {
    const kind = kinds[index % kinds.length];
    const evidence = {
        kind,
        key: `${kind}:${index + 10}`,
        id: index + 10,
        locale: index % 2 ? "en" : "fa",
        publicUrl: index % 3 ? `https://example.com/${kind}/${index}` : null,
        title: index % 4 ? `عنوان نمونه استاندارد شماره ${index} برای تحلیل سئو` : "",
        slug: kind === "media" ? null : index % 5 ? `sample-${index}` : "Bad Slug",
        shortDescription: index % 3 ? "توضیح نمونه معتبر برای تحلیل طول و کیفیت متا و محتوای موجودیت در موتور سئوی کالیبرا." : "",
        description: index % 2 ? `<p>${"محتوای نمونه ".repeat(80)}</p>` : "",
        status: statuses[index % statuses.length],
        sku: kind === "product" && index % 2 ? `SKU-${index}` : null,
        gtin: kind === "product" && index % 3 ? `GTIN-${index}` : null,
        brandCount: kind === "product" ? index % 2 : 0,
        categoryCount: kind === "product" ? index % 3 : 0,
        imageCount: kind === "product" || kind === "media" ? index % 4 : 0,
        imageAltCount: kind === "product" || kind === "media" ? index % 3 : 0,
        priceMinor: kind === "product" && index % 2 ? index * 1000 : null,
        stockStatus: kind === "product" ? (index % 3 ? "instock" : "outofstock") : null,
        productCount: kind === "category" || kind === "brand" ? index % 5 : 0,
        relatedProductCount: kind === "content_post" ? index % 4 : 0,
        internalInboundCount: index % 3,
        internalOutboundCount: index % 5,
        profile:
            index % 2
                ? {
                      metaTitle: `عنوان متای استاندارد برای موجودیت شماره ${index}`,
                      metaDescription:
                          "توضیح متای استاندارد و قابل فهم که برای ارزیابی قواعد سئو و کنترل طول متن در سامانه کالیبرا استفاده می‌شود و هدف صفحه را روشن بیان می‌کند.",
                      canonicalUrl: index % 3 ? `https://example.com/${kind}/${index}` : null,
                      robotsIndex: index % 7 !== 0,
                      robotsFollow: true,
                  }
                : null,
    };
    for (const profile of ["k20", "k21"]) {
        const result = analyzer.analyzeSeoEvidence(evidence, profile);
        check(Number.isInteger(result.total), `case ${index}/${profile} total must be integer`);
        check(result.total >= 0 && result.total <= 100, `case ${index}/${profile} total must be bounded`);
        check(
            result.issues.every((item) => item.penalty >= 0),
            `case ${index}/${profile} penalties must be non-negative`,
        );
        check(
            result.issues.every((item) => ["info", "warning", "critical"].includes(item.severity)),
            `case ${index}/${profile} severity must be valid`,
        );
        check(
            result.issues.every((item) => Boolean(item.ruleCode)),
            `case ${index}/${profile} rule codes must exist`,
        );
    }
}

const settings = { ...domain.DEFAULT_SEO_SETTINGS, base_url: "https://example.com", organization_name: "Calibra Demo" };
const robots = builders.buildRobotsDocument(settings);
check(robots.rules.length >= 2, "Robots must include wildcard and OAI-SearchBot rules");
check(robots.sitemap[0] === "https://example.com/sitemap.xml", "Robots sitemap URL must be absolute");
const robotsText = builders.serializeRobots(robots);
for (const token of ["User-agent: *", "User-agent: OAI-SearchBot", "Sitemap: https://example.com/sitemap.xml"])
    check(robotsText.includes(token), `Robots output missing ${token}`);

const sitemapCases = [];
for (let index = 0; index < 80; index += 1) {
    sitemapCases.push({
        url: index % 8 === 0 ? "invalid" : `https://example.com/page-${index % 63}`,
        lastModified: `2026-07-${String((index % 28) + 1).padStart(2, "0")}T12:00:00Z`,
        changeFrequency: index % 2 ? "weekly" : "monthly",
        priority: index / 100,
        images: [`https://example.com/image-${index}.webp`, `https://example.com/image-${index}.webp`],
    });
}
const filtered = builders.filterSitemapEntries(sitemapCases);
check(
    filtered.every((entry) => entry.url.startsWith("https://")),
    "Sitemap must drop invalid URLs",
);
check(new Set(filtered.map((entry) => entry.url)).size === filtered.length, "Sitemap must deduplicate URLs");
check(
    filtered.every((entry) => new Set(entry.images).size === entry.images.length),
    "Sitemap must deduplicate images",
);
const chunks = builders.chunkSitemapEntries(sitemapCases, 13);
check(
    chunks.every((chunk) => chunk.length <= 13),
    "Sitemap chunks must respect requested size",
);
check(chunks.flat().length === filtered.length, "Sitemap chunking must preserve all filtered entries");
const xml = builders.serializeSitemapXml(sitemapCases);
for (const token of ["<?xml", "<urlset", "xmlns:image", "<loc>", "<lastmod>", "<image:image>"])
    check(xml.includes(token), `Sitemap XML missing ${token}`);

const productSchema = builders.buildEntitySchema(completeProduct, settings);
check(productSchema?.["@context"] === "https://schema.org", "Product schema context invalid");
check(["Product", "ProductGroup"].includes(productSchema?.["@type"]), "Product schema type invalid");
check(productSchema?.name === completeProduct.profile.metaTitle, "Product schema must prefer SEO title");
check(productSchema?.offers?.priceCurrency === "IRR", "Product schema currency must be IRR for current storefront contract");
check(productSchema?.offers?.availability === "https://schema.org/InStock", "Product schema stock status invalid");

const articleSchema = builders.buildEntitySchema(
    {
        kind: "content_post",
        key: "content_post:1",
        id: 1,
        locale: "fa",
        publicUrl: "https://example.com/fa/mag/demo",
        title: "راهنمای نمونه",
        description: "محتوای نمونه",
        publishedAt: "2026-07-01T00:00:00Z",
        updatedAt: "2026-07-02T00:00:00Z",
        authorName: "تیم تحریریه",
    },
    settings,
);
check(articleSchema?.["@type"] === "BlogPosting", "Article schema type invalid");
check(articleSchema?.author?.name === "تیم تحریریه", "Article author schema invalid");
check(Boolean(articleSchema?.datePublished), "Article published date missing");
check(Boolean(articleSchema?.dateModified), "Article modified date missing");

const organization = builders.buildOrganizationSchema(settings);
check(organization?.["@type"] === "Organization", "Organization schema type invalid");
check(organization?.url === "https://example.com", "Organization URL invalid");
check(organization?.["@id"] === "https://example.com#organization", "Organization identifier invalid");

fs.rmSync(tempDir, { recursive: true, force: true });

if (failures.length) {
    console.error(`SEO integration verification FAILED: ${failures.length}/${checks} checks failed`);
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
}
console.log(`SEO integration verification PASSED: ${checks} checks`);
console.log(`TypeScript files transpiled: ${sourceFiles.length + 3}`);
console.log(`Admin SEO routes: ${routeModes.length}`);
console.log(`Tenant-safe SEO tables: ${tables.length}`);
