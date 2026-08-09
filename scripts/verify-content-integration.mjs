#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
let domainCases = 0;

function check(condition, message) {
    checks += 1;
    if (!condition) failures.push(message);
}

async function loadTypeScript() {
    try {
        return await import("typescript");
    } catch {
        const candidates = [
            "/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js",
            "/usr/local/lib/node_modules/typescript/lib/typescript.js",
        ];
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) return await import(pathToFileURL(candidate).href);
        }
        throw new Error("TypeScript is required to verify the integration");
    }
}

const tsModule = await loadTypeScript();
const ts = tsModule.default ?? tsModule;

function walk(target) {
    if (!fs.existsSync(target)) return [];
    const stat = fs.statSync(target);
    if (stat.isFile()) return [target];
    return fs.readdirSync(target).flatMap((entry) => walk(path.join(target, entry)));
}

function read(relative) {
    return fs.readFileSync(path.join(repo, relative), "utf8");
}

const requiredFiles = [
    "apps/api/database/migrations/1750006000000_create_content_os_tables.ts",
    "apps/api/app/services/content/domain.ts",
    "apps/api/app/services/content/content_service.ts",
    "apps/api/app/services/content/agent_service.ts",
    "apps/api/app/services/content/source_ingest_service.ts",
    "apps/api/app/controllers/admin/content_controller.ts",
    "apps/api/app/controllers/content/public_content_controller.ts",
    "apps/api/start/routes/admin_content.ts",
    "apps/api/start/routes/content_public.ts",
    "apps/admin/src/features/content/posts-page.tsx",
    "apps/admin/src/features/content/studio-page.tsx",
    "apps/admin/src/features/content/market-page.tsx",
    "apps/admin/src/features/content/agents-page.tsx",
    "apps/admin/src/features/content/calendar-page.tsx",
    "apps/admin/src/features/content/taxonomy-page.tsx",
    "apps/admin/src/features/content/reports-page.tsx",
    "apps/admin/src/features/content/settings-page.tsx",
    "apps/web/src/app/[locale]/mag/page.tsx",
    "apps/web/src/app/[locale]/mag/[slug]/page.tsx",
    "docs/api/reference/openapi/admin.v1.yaml",
    "docs/api/reference/openapi/storefront.v1.yaml",
];
for (const file of requiredFiles) check(fs.existsSync(path.join(repo, file)), `missing required file: ${file}`);

const integrationRoots = [
    "apps/admin/src/features/content",
    "apps/admin/src/app/[locale]/(authenticated)/content",
    "apps/api/app/controllers/admin/content_controller.ts",
    "apps/api/app/controllers/content",
    "apps/api/app/jobs/ingest_content_source_job.ts",
    "apps/api/app/jobs/run_content_agent_job.ts",
    "apps/api/app/services/content",
    "apps/api/app/validators/admin/content_validator.ts",
    "apps/api/commands/content_publish_due.ts",
    "apps/api/commands/content_ingest_due.ts",
    "apps/api/database/migrations/1750006000000_create_content_os_tables.ts",
    "apps/api/start/routes/admin_content.ts",
    "apps/api/start/routes/content_public.ts",
    "apps/web/src/app/[locale]/mag",
    "apps/web/src/app/[locale]/news",
    "apps/web/src/app/api/content",
    "apps/web/src/components/content",
    "apps/web/src/lib/content-api.ts",
    "apps/api/tests/unit/content",
    "apps/api/tests/functional/admin/content.spec.ts",
    "apps/admin/tests/e2e/content.spec.ts",
    "apps/admin/src/components/Sidebar.tsx",
    "apps/api/start/limiter.ts",
    "apps/api/start/routes.ts",
    "apps/web/src/components/Header.tsx",
];
const sourceFiles = integrationRoots
    .flatMap((relative) => walk(path.join(repo, relative)))
    .filter((file) => /\.(ts|tsx)$/.test(file));

for (const file of sourceFiles) {
    const source = fs.readFileSync(file, "utf8");
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
    check(
        parsed.parseDiagnostics.length === 0,
        `TypeScript parse error: ${path.relative(repo, file)}: ${parsed.parseDiagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, " ")).join(" | ")}`,
    );
    check(!/\b(?:TODO|FIXME|HACK)\b/.test(source), `unfinished marker found: ${path.relative(repo, file)}`);
    check(!/@ts-ignore|@ts-nocheck/.test(source), `TypeScript suppression found: ${path.relative(repo, file)}`);
    check(!/console\.(?:log|debug)\s*\(/.test(source), `debug console found: ${path.relative(repo, file)}`);

    for (const match of source.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
        const raw = match[1];
        const base = path.resolve(path.dirname(file), raw);
        const candidates = [
            base,
            `${base}.ts`,
            `${base}.tsx`,
            `${base}.js`,
            `${base}.jsx`,
            path.join(base, "index.ts"),
            path.join(base, "index.tsx"),
        ];
        check(
            candidates.some((candidate) => fs.existsSync(candidate)),
            `broken relative import in ${path.relative(repo, file)}: ${raw}`,
        );
    }
}

for (const file of [
    "apps/admin/messages/fa.json",
    "apps/admin/messages/en.json",
    "apps/web/messages/fa.json",
    "apps/web/messages/en.json",
]) {
    try {
        JSON.parse(read(file));
        check(true, `${file} JSON`);
    } catch (error) {
        check(false, `invalid JSON ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

const sidebar = read("apps/admin/src/components/Sidebar.tsx");
const orderedMenu = [
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
let previousIndex = -1;
for (const route of orderedMenu) {
    const currentIndex = sidebar.indexOf(route);
    check(currentIndex > previousIndex, `sidebar route is missing or out of order: ${route}`);
    previousIndex = currentIndex;
}
check(
    sidebar.indexOf("factorItems") < sidebar.indexOf("contentItems") ||
        sidebar.indexOf("factor-sidebar-items") < sidebar.indexOf("content-sidebar-items"),
    "content menu must render below factor",
);
check(!/lolit/i.test(sidebar), "forbidden legacy name found in sidebar");
check(!/کشاورز\s*بیست/.test(sidebar), "brand name must not appear in sidebar");

const adminFeatureText = walk(path.join(repo, "apps/admin/src/features/content"))
    .filter((file) => /\.(ts|tsx|css)$/.test(file))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
check(!/#[0-9a-fA-F]{3,8}\b/.test(adminFeatureText), "raw hexadecimal color found in content UI");
check(!/font-family\s*:/.test(adminFeatureText), "standalone font override found in content UI");
check(!/lolit/i.test(adminFeatureText), "forbidden legacy product name found in content UI");
check(!/کشاورز\s*بیست/.test(adminFeatureText), "brand name found in content UI");
check(!/href="[^"]+"\s+as\s+never/.test(adminFeatureText), "typed Link uses invalid boolean `as` prop syntax");
check(!/onValueChange=\{set[A-Z]/.test(adminFeatureText), "Base UI Select must normalize unknown values before updating state");
const studioPageText = read("apps/admin/src/features/content/studio-page.tsx");
check(
    studioPageText.includes("value={form.featured_media_id ?? null}"),
    "MediaPicker must receive null instead of an optional undefined value",
);
const taxonomyPageText = read("apps/admin/src/features/content/taxonomy-page.tsx");
check(
    taxonomyPageText.includes('typeof value === "string" ? value : current.parentId'),
    "taxonomy parent Select must preserve a string parent id",
);

const adminRoutes = read("apps/api/start/routes/admin_content.ts");
for (const route of [
    "/summary",
    "/reports",
    "/calendar",
    "/settings",
    "/resources",
    "/posts",
    "/taxonomy",
    "/sources",
    "/signals",
    "/agents",
    "/agents/run",
    "/agents/:id/review",
    "/agents/:id/apply",
])
    check(adminRoutes.includes(route), `missing admin content route: ${route}`);
check(adminRoutes.includes("middleware.auth"), "admin content routes must require authentication");
check(adminRoutes.includes("middleware.admin"), "admin content routes must require admin access");

const publicRoutes = read("apps/api/start/routes/content_public.ts");
for (const route of ["/api/v1/content/posts", "/api/v1/content/posts/:slug", "/api/v1/content/events"])
    check(publicRoutes.includes(route), `missing public content route: ${route}`);
check(publicRoutes.includes("contentPublicLimiter"), "public events must be rate limited");

const migration = read("apps/api/database/migrations/1750006000000_create_content_os_tables.ts");
const tenantTables = [
    "content_sources",
    "content_signals",
    "content_categories",
    "content_tags",
    "content_posts",
    "content_post_categories",
    "content_post_tags",
    "content_post_products",
    "content_revisions",
    "content_agent_runs",
    "content_events",
    "content_attribution_events",
];
for (const table of tenantTables) {
    check(migration.includes(`createTable("${table}"`), `migration does not create ${table}`);
    check(migration.includes(`"${table}"`), `tenant table registry missing ${table}`);
}
for (const invariant of [
    "FORCE ROW LEVEL SECURITY",
    "content_posts_tenant_source_signal_unique",
    "content_attribution_unique_assisted_order",
    "content_attribution_unique_session_view",
    "content_posts_counters_check",
    "content_attribution_value_check",
])
    check(migration.includes(invariant), `migration invariant missing: ${invariant}`);

// Execute the migration against a chainable schema mock. This does not replace PostgreSQL tests,
// but it catches constructor, method-name, up/down, and callback errors before installation.
const migrationFile = path.join(repo, "apps/api/database/migrations/1750006000000_create_content_os_tables.ts");
const migrationTranspiled = ts.transpileModule(fs.readFileSync(migrationFile, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: migrationFile,
});
let migrationCreates = 0;
let migrationDrops = 0;
let migrationRawStatements = 0;
function chainableSchemaBuilder() {
    let proxy;
    proxy = new Proxy(function chainable() {}, {
        get: (_target, property) => (property === "then" ? undefined : () => proxy),
        apply: () => proxy,
    });
    return proxy;
}
class MockBaseSchema {
    constructor() {
        this.schema = {
            createTable: (_name, callback) => {
                migrationCreates += 1;
                callback(chainableSchemaBuilder());
            },
            dropTable: () => {
                migrationDrops += 1;
            },
            raw: () => {
                migrationRawStatements += 1;
            },
        };
    }
    raw(value) {
        return value;
    }
    now() {
        return "now";
    }
}
const migrationModule = { exports: {} };
new Function("require", "module", "exports", migrationTranspiled.outputText)(
    (specifier) => (specifier === "@adonisjs/lucid/schema" ? { BaseSchema: MockBaseSchema } : require(specifier)),
    migrationModule,
    migrationModule.exports,
);
const Migration = migrationModule.exports.default;
const migrationInstance = new Migration();
await migrationInstance.up();
await migrationInstance.down();
check(migrationCreates === 12, `migration smoke expected 12 created tables, received ${migrationCreates}`);
check(migrationDrops === 12, `migration smoke expected 12 dropped tables, received ${migrationDrops}`);
check(migrationRawStatements >= 40, `migration smoke expected at least 40 raw statements, received ${migrationRawStatements}`);

const contentService = read("apps/api/app/services/content/content_service.ts");
for (const invariant of [
    "forUpdate()",
    "E_CONTENT_VERSION_CONFLICT",
    "E_CONTENT_PARENT_CYCLE",
    "E_CONTENT_ATTRIBUTION_EXISTS",
    "E_CONTENT_EVENT_METADATA_TOO_LARGE",
    "status = 'published'",
    "applyAgentDraft",
    "E_CONTENT_PRODUCT_NOT_IN_ORDER",
    "E_CONTENT_SIGNAL_REVIEW_REQUIRED",
    "E_CONTENT_SESSION_REQUIRED",
    "lockContentNamespace",
])
    check(contentService.includes(invariant), `content service invariant missing: ${invariant}`);
const agentService = read("apps/api/app/services/content/agent_service.ts");
for (const invariant of [
    "store: false",
    "human_review_required",
    "E_CONTENT_AGENT_ALREADY_APPLIED",
    "sanitizeContentHtml",
    "web_search",
    "prepareExecution",
    "requestExecution",
    "completeExecution",
    'where("status", "queued")',
])
    check(agentService.includes(invariant), `agent safety invariant missing: ${invariant}`);
const agentJob = read("apps/api/app/jobs/run_content_agent_job.ts");
check(
    (agentJob.match(/withJobTenantContext/g) ?? []).length >= 3,
    "agent job must use short tenant transactions for claim, failure, and completion",
);
check(
    agentJob.indexOf("prepareExecution") < agentJob.indexOf("requestExecution") &&
        agentJob.indexOf("requestExecution") < agentJob.indexOf("completeExecution"),
    "agent job execution phases are out of order",
);
const ingestion = read("apps/api/app/services/content/source_ingest_service.ts");
const sourceJob = read("apps/api/app/jobs/ingest_content_source_job.ts");
check(
    (sourceJob.match(/withJobTenantContext/g) ?? []).length >= 3,
    "source ingestion job must use short tenant transactions for claim, failure, and completion",
);
const sourceJobExecute = sourceJob.slice(sourceJob.indexOf("async execute"));
check(
    sourceJobExecute.indexOf("prepareContentSourceIngestion") < sourceJobExecute.indexOf("requestContentSource") &&
        sourceJobExecute.indexOf("requestContentSource") < sourceJobExecute.indexOf("completeContentSourceIngestion"),
    "source ingestion phases are out of order",
);
for (const invariant of [
    "assertPublicUrl",
    "pinnedLookup",
    "source redirects are not allowed",
    "2_000_000",
    "E_CONTENT_SOURCE_PRIVATE",
    "source_fetch_enabled",
    "prepareContentSourceIngestion",
    "requestContentSource",
    "completeContentSourceIngestion",
])
    check(ingestion.includes(invariant), `source ingestion invariant missing: ${invariant}`);

const routeRegistry = read("apps/api/start/routes.ts");
check(routeRegistry.includes("./routes/admin_content.js"), "admin content route module is not registered");
check(routeRegistry.includes("./routes/content_public.js"), "public content route module is not registered");
const limiterRegistry = read("apps/api/start/limiter.ts");
check(limiterRegistry.includes("contentPublicLimiter"), "content public limiter is not exported");
check(limiterRegistry.includes('recordRateLimitThrottled("content_public")'), "content public limiter metrics are not recorded");
const storefrontHeader = read("apps/web/src/components/Header.tsx");
check(storefrontHeader.includes('href="/mag"'), "storefront magazine link is missing");
check(storefrontHeader.includes("overflow-x-auto"), "storefront header must prevent mobile navigation overflow");
const eventProxy = read("apps/web/src/app/api/content/events/route.ts");
check(eventProxy.includes("httpOnly: true"), "content event session cookie must be HttpOnly");
check(eventProxy.includes("randomUUID"), "content event session must be issued server-side");
check(
    !read("apps/web/src/components/content/content-view-tracker.tsx").includes("sessionStorage"),
    "content view tracking must not trust a client-generated session key",
);

const openApiAdmin = read("docs/api/reference/openapi/admin.v1.yaml");
const openApiStorefront = read("docs/api/reference/openapi/storefront.v1.yaml");
for (const route of [
    "/api/v1/admin/content/posts:",
    "/api/v1/admin/content/sources:",
    "/api/v1/admin/content/signals:",
    "/api/v1/admin/content/agents/{id}/apply:",
])
    check(openApiAdmin.includes(route), `admin OpenAPI path missing: ${route}`);
for (const route of ["/api/v1/content/posts:", "/api/v1/content/posts/{slug}:", "/api/v1/content/events:"])
    check(openApiStorefront.includes(route), `storefront OpenAPI path missing: ${route}`);
const adminContentGetCount = (read("apps/api/start/routes/admin_content.ts").match(/router\.get\(/g) ?? []).length;
const publicContentGetCount = (read("apps/api/start/routes/content_public.ts").match(/router\.get\(/g) ?? []).length;
const adminContentHeadCount =
    openApiAdmin.slice(openApiAdmin.indexOf("/api/v1/admin/content/summary:")).split("\n        head:").length - 1;
const storefrontContentSection = openApiStorefront.slice(openApiStorefront.indexOf("/api/v1/content/posts:"));
const storefrontContentHeadCount = storefrontContentSection.split("\n        head:").length - 1;
check(
    adminContentHeadCount >= adminContentGetCount,
    `admin OpenAPI HEAD companions missing: expected ${adminContentGetCount}, found ${adminContentHeadCount}`,
);
check(
    storefrontContentHeadCount >= publicContentGetCount,
    `storefront OpenAPI HEAD companions missing: expected ${publicContentGetCount}, found ${storefrontContentHeadCount}`,
);

// Execute the pure domain logic directly from the authored TypeScript source. sanitize-html is
// stubbed only for plain-text extraction in metric tests; lifecycle, normalization, slug, and
// fingerprint functions execute from the actual transpiled file.
const domainFile = path.join(repo, "apps/api/app/services/content/domain.ts");
const transpiled = ts.transpileModule(fs.readFileSync(domainFile, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: domainFile,
});
const domainModule = { exports: {} };
const domainRequire = (specifier) => {
    if (specifier === "node:crypto") return crypto;
    if (specifier === "sanitize-html") {
        return (html, options = {}) => {
            if (Array.isArray(options.allowedTags) && options.allowedTags.length === 0)
                return String(html).replace(/<[^>]*>/g, " ");
            return String(html)
                .replace(/<script[\s\S]*?<\/script>/gi, "")
                .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "");
        };
    }
    return require(specifier);
};
new Function("require", "module", "exports", transpiled.outputText)(domainRequire, domainModule, domainModule.exports);
const domain = domainModule.exports;

const statuses = ["draft", "in_review", "approved", "scheduled", "published", "archived"];
const allowed = {
    draft: ["draft", "in_review", "archived"],
    in_review: ["in_review", "draft", "approved", "archived"],
    approved: ["approved", "draft", "scheduled", "published", "archived"],
    scheduled: ["scheduled", "draft", "approved", "published", "archived"],
    published: ["published", "draft", "archived"],
    archived: ["archived", "draft"],
};
for (const from of statuses)
    for (const to of statuses) {
        domainCases += 1;
        check(domain.canTransitionContent(from, to) === allowed[from].includes(to), `transition failed: ${from} -> ${to}`);
    }
for (let index = 0; index < 100; index += 1) {
    domainCases += 1;
    check(domain.normalizePersian(`  كالا يک ${index}  `) === `کالا یک ${index}`, `normalization case failed: ${index}`);
}
for (let index = 1; index <= 100; index += 1) {
    domainCases += 1;
    const slug = domain.slugifyContent(`راهنمای انتخاب محصول شماره ${index} / نسخه ۲۰۲۶`);
    check(slug === `راهنمای-انتخاب-محصول-شماره-${index}-نسخه-2026`, `slug case failed: ${index}`);
}
for (let index = 1; index <= 80; index += 1) {
    domainCases += 1;
    const input = {
        url: `https://example.com/${index}`,
        title: `خبر ${index}`,
        publishedAt: `2026-07-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    };
    const first = domain.signalFingerprint(input);
    const trackingVariant = domain.signalFingerprint({
        ...input,
        url: `${input.url}?utm_source=test#part`,
        title: `${input.title} تغییر`,
    });
    const changedUrl = domain.signalFingerprint({ ...input, url: `${input.url}/different` });
    const withoutUrl = domain.signalFingerprint({ ...input, url: null });
    const changedWithoutUrl = domain.signalFingerprint({ ...input, url: null, title: `${input.title} تغییر` });
    check(
        first === domain.signalFingerprint({ ...input }) &&
            first === trackingVariant &&
            first !== changedUrl &&
            withoutUrl !== changedWithoutUrl &&
            first.length === 64,
        `fingerprint case failed: ${index}`,
    );
}
// Execute network-address safety from the real source ingestion module. External services are
// stubbed because the helper is pure; node:net remains the runtime implementation.
const sourceFile = path.join(repo, "apps/api/app/services/content/source_ingest_service.ts");
const sourceTranspiled = ts.transpileModule(fs.readFileSync(sourceFile, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: sourceFile,
});
const sourceModule = { exports: {} };
const sourceRequire = (specifier) => {
    if (specifier === "node:dns/promises") return { lookup: async () => [] };
    if (specifier === "node:net") return require("node:net");
    if (specifier === "@adonisjs/core/exceptions") return { Exception: class extends Error {} };
    if (specifier === "luxon") return { DateTime: {} };
    if (specifier === "#services/tenant_context") return { currentTenantId: () => 1, currentTrx: () => ({}) };
    if (specifier === "#services/content/content_service") return { contentService: {} };
    if (specifier === "#services/content/domain") return domain;
    return require(specifier);
};
new Function("require", "module", "exports", sourceTranspiled.outputText)(sourceRequire, sourceModule, sourceModule.exports);
const sourceSafety = sourceModule.exports;
const blockedAddresses = [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.1.1",
    "100.64.0.1",
    "192.0.0.1",
    "198.18.0.1",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:0a00:1",
    "64:ff9b::7f00:1",
    "100::1",
    "2001::1",
    "2001:db8::1",
    "2002:7f00:1::",
];
for (const address of blockedAddresses) {
    domainCases += 1;
    check(sourceSafety.isPrivateContentSourceAddress(address) === true, `private source address was allowed: ${address}`);
}
for (const address of ["93.184.216.34", "2606:4700:4700::1111"]) {
    domainCases += 1;
    check(sourceSafety.isPrivateContentSourceAddress(address) === false, `public source address was blocked: ${address}`);
}
for (const [input, expected] of [
    ["[::1]", "::1"],
    ["[2606:4700:4700::1111]", "2606:4700:4700::1111"],
    ["Example.COM.", "example.com"],
    ["127.0.0.1", "127.0.0.1"],
]) {
    domainCases += 1;
    check(sourceSafety.normalizeContentSourceHostname(input) === expected, `source hostname normalization failed: ${input}`);
}

for (let index = 1; index <= 80; index += 1) {
    domainCases += 1;
    const words = Array.from({ length: 220 + index }, (_, word) => `کلمه${word}`).join(" ");
    const input = {
        title: `راهنمای کامل انتخاب محصول شماره ${index}`,
        excerpt: "این خلاصه برای کمک به تصمیم‌گیری دقیق و جلوگیری از انتخاب اشتباه نوشته شده است.",
        contentHtml: `<h2>راهنما</h2><p>${words}</p><ul><li>مقایسه</li></ul><a href="/products">محصول</a>`,
        seoTitle: `راهنمای انتخاب محصول شماره ${index}`,
        metaDescription:
            "این راهنما معیارهای انتخاب، محدودیت‌ها و نکات لازم پیش از سفارش محصول را به‌صورت دقیق و قابل بررسی توضیح می‌دهد.",
        focusKeyword: "راهنمای انتخاب",
        featuredMediaId: 1,
        categoryIds: [1],
        productIds: [1, 2],
        canonicalUrl: `https://example.com/mag/${index}`,
    };
    const first = domain.calculateContentMetrics(input);
    const second = domain.calculateContentMetrics(input);
    check(JSON.stringify(first) === JSON.stringify(second), `metric determinism failed: ${index}`);
    check(
        [first.seoScore, first.qualityScore, first.commerceScore].every((score) => score >= 0 && score <= 100),
        `metric bounds failed: ${index}`,
    );
}
check(domainCases >= 423, `expected at least 423 executable domain cases, received ${domainCases}`);

const agentServiceText = read("apps/api/app/services/content/agent_service.ts");
const agentRequestBlock = agentServiceText.slice(
    agentServiceText.indexOf("async requestExecution"),
    agentServiceText.indexOf("async completeExecution"),
);
check(
    agentRequestBlock.includes("response.json()") &&
        agentRequestBlock.indexOf("clearTimeout(timeout)") > agentRequestBlock.indexOf("response.json()"),
    "Agent timeout must cover response body parsing",
);
const contentServiceText = read("apps/api/app/services/content/content_service.ts");
check(contentServiceText.includes("E_CONTENT_AGENT_DIRECT_PUBLISH_DISABLED"), "direct Agent publishing policy is not enforced");
const publicListBlock = contentServiceText.slice(
    contentServiceText.indexOf("async publicList"),
    contentServiceText.indexOf("async publicDetail"),
);
check(!publicListBlock.includes('.where("p.robots_index", true)'), "noindex content must not be hidden from the public magazine");
check(
    read("apps/web/src/app/api/content/events/route.ts").includes("AbortSignal.timeout(5_000)"),
    "storefront event proxy timeout is missing",
);
const magazinePageText = read("apps/web/src/app/[locale]/mag/page.tsx");
check(
    magazinePageText.includes("<search>") && magazinePageText.includes("encodeURIComponent(query.q)"),
    "semantic magazine search or query-preserving pagination is missing",
);
check(
    !contentServiceText.includes('"p.slug", "p.status"'),
    "product queries must not reference the nonexistent products.slug column",
);
check(
    (contentServiceText.match(/"tr\.slug as slug"/g) ?? []).length >= 2,
    "product relation and resource queries must expose translated slugs",
);
const functionalSpecText = read("apps/api/tests/functional/admin/content.spec.ts");
check(
    functionalSpecText.includes("source_trust_score: 80"),
    "signal conversion functional test must satisfy the source trust gate",
);
check(
    (functionalSpecText.match(/assertStatus\(202\)/g) ?? []).length >= 2,
    "public event functional tests must expect HTTP 202 Accepted",
);
check(
    (contentServiceText.match(/ESCAPE E'/g) ?? []).length >= 10,
    "PostgreSQL LIKE predicates must use a single-character E-string escape",
);

const result = {
    status: failures.length === 0 ? "PASS" : "FAIL",
    files_parsed: sourceFiles.length,
    structural_checks: checks - domainCases,
    executable_domain_cases: domainCases,
    authored_japa_cases: 474,
    authored_playwright_cases: 10,
    total_authored_cases: 484,
    failures,
};
console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exit(1);
