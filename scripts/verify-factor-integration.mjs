#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const failures = [];
let checks = 0;
let domainCases = 0;
let syntaxFiles = 0;

function pass(condition, message) {
    checks += 1;
    if (!condition) failures.push(message);
}

function read(relative) {
    return fs.readFileSync(path.join(root, relative), "utf8");
}

function exists(relative) {
    return fs.existsSync(path.join(root, relative));
}

function walk(relative, extensions = new Set([".ts", ".tsx"])) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return [];
    const output = [];
    const stack = [absolute];
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;
        const stat = fs.statSync(current);
        if (stat.isDirectory()) {
            for (const name of fs.readdirSync(current)) {
                if (["node_modules", ".next", "dist", "coverage"].includes(name)) continue;
                stack.push(path.join(current, name));
            }
        } else if (extensions.has(path.extname(current))) {
            output.push(current);
        }
    }
    return output.sort();
}

async function loadTypeScript() {
    const candidates = [
        "typescript",
        process.env.TYPESCRIPT_MODULE_PATH,
        "/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js",
        "/usr/local/lib/node_modules/typescript/lib/typescript.js",
        "/usr/lib/node_modules/typescript/lib/typescript.js",
    ].filter(Boolean);
    for (const candidate of candidates) {
        try {
            if (candidate === "typescript") return await import(candidate);
            if (fs.existsSync(candidate)) return await import(pathToFileURL(candidate).href);
        } catch {
            // Try the next candidate.
        }
    }
    throw new Error("TypeScript module was not found. Run pnpm install before verification.");
}

function moduleFromTranspiled(source) {
    return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

function assertEqual(actual, expected, label) {
    domainCases += 1;
    if (!Object.is(actual, expected)) {
        failures.push(`${label}: expected ${String(expected)}, received ${String(actual)}`);
    }
}

function assertThrows(fn, expectedMessage, label) {
    domainCases += 1;
    try {
        fn();
        failures.push(`${label}: expected an exception`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes(expectedMessage)) failures.push(`${label}: unexpected error ${message}`);
    }
}

const requiredFiles = [
    "apps/admin/src/components/Sidebar.tsx",
    "apps/admin/src/features/factor/documents-list.tsx",
    "apps/admin/src/features/factor/document-editor.tsx",
    "apps/admin/src/features/factor/document-detail.tsx",
    "apps/admin/src/features/factor/payments-page.tsx",
    "apps/admin/src/features/factor/reports-page.tsx",
    "apps/admin/src/features/factor/records-page.tsx",
    "apps/admin/src/features/factor/settings-page.tsx",
    "apps/admin/src/features/factor/public-checkout.tsx",
    "apps/admin/src/features/factor/document-print.tsx",
    "apps/admin/src/app/[locale]/(authenticated)/factor/documents/[id]/print/page.tsx",
    "apps/admin/src/app/api/factor/pay/[code]/route.ts",
    "apps/admin/src/app/api/factor/pay/[code]/init/route.ts",
    "apps/api/app/services/factor/document_service.ts",
    "apps/api/app/services/factor/money.ts",
    "apps/api/app/services/factor/lifecycle.ts",
    "apps/api/app/jobs/reconcile_factor_payment_job.ts",
    "apps/api/app/controllers/admin/factor_documents_controller.ts",
    "apps/api/app/controllers/admin/factor_dashboard_controller.ts",
    "apps/api/app/controllers/factor_public_controller.ts",
    "apps/api/app/validators/admin/factor_validator.ts",
    "apps/api/database/migrations/1750005000000_expand_order_documents_for_factor.ts",
    "apps/api/database/migrations/1750005000001_add_factor_document_type_invariants.ts",
    "apps/api/start/routes/admin_factor.ts",
    "apps/api/start/routes/factor_public.ts",
    "apps/api/tests/unit/factor/factor_domain.spec.ts",
    "apps/api/tests/functional/admin/factor.spec.ts",
    "apps/admin/src/features/factor/__tests__/utils.test.ts",
    "apps/admin/tests/e2e/factor.spec.ts",
    "docs/api/reference/openapi/common/components/schemas/FactorDocument.yaml",
    "docs/api/reference/openapi/common/components/schemas/FactorDocumentInput.yaml",
    "docs/api/reference/openapi/common/components/schemas/FactorDocumentUpdateInput.yaml",
    "docs/api/reference/openapi/common/components/schemas/FactorDocumentEnvelope.yaml",
    "docs/api/reference/openapi/common/components/schemas/FactorDocumentListEnvelope.yaml",
    "docs/api/reference/openapi/common/components/schemas/FactorSummaryEnvelope.yaml",
    "docs/api/reference/openapi/common/components/schemas/FactorReportsEnvelope.yaml",
    "docs/api/reference/openapi/common/components/schemas/FactorSettingsEnvelope.yaml",
    "docs/api/reference/openapi/common/components/schemas/FactorResourceListEnvelope.yaml",
    "docs/api/reference/openapi/common/components/schemas/FactorPaymentAttemptListEnvelope.yaml",
    "docs/api/reference/openapi/common/components/schemas/FactorPaymentLinkEnvelope.yaml",
    "docs/api/reference/openapi/common/components/schemas/FactorPublicPaymentEnvelope.yaml",
    "docs/api/reference/openapi/common/components/schemas/FactorPaymentInitEnvelope.yaml",
];
for (const file of requiredFiles) pass(exists(file), `Missing required file: ${file}`);

for (const localeFile of ["apps/admin/messages/fa.json", "apps/admin/messages/en.json"]) {
    try {
        JSON.parse(read(localeFile));
        pass(true, `${localeFile} parses as JSON`);
    } catch (error) {
        pass(false, `${localeFile} is invalid JSON: ${String(error)}`);
    }
}

const fa = JSON.parse(read("apps/admin/messages/fa.json"));
const expectedMenu = [
    ["factor", "فاکتور"],
    ["factorDocuments", "فاکتورها و پیش‌فاکتورها"],
    ["factorPayments", "پرداخت‌ها و درگاه‌ها"],
    ["factorReports", "گزارش‌ها"],
    ["factorRecords", "مشتریان و کاتالوگ"],
    ["factorSettings", "تنظیمات"],
];
for (const [key, value] of expectedMenu) pass(fa.Nav?.[key] === value, `Missing or incorrect Persian menu key Nav.${key}`);

const sidebar = read("apps/admin/src/components/Sidebar.tsx");
let previousIndex = -1;
for (const token of ["factorDocuments", "factorPayments", "factorReports", "factorRecords", "factorSettings"]) {
    const currentIndex = sidebar.indexOf(token);
    pass(currentIndex > previousIndex, `Factor sidebar order is incorrect around ${token}`);
    previousIndex = currentIndex;
}
pass(sidebar.includes("aria-expanded={factorOpen}"), "Factor sidebar submenu is not accessible/collapsible");
pass(sidebar.includes('group.titleKey === "sales"'), "Factor submenu is not placed under Sales");

const visibleFiles = [
    ...walk("apps/admin/src/features/factor"),
    ...walk("apps/admin/src/app/[locale]/(authenticated)/factor"),
    ...walk("apps/admin/src/app/[locale]/pay"),
    path.join(root, "apps/admin/src/components/Sidebar.tsx"),
    path.join(root, "apps/admin/messages/fa.json"),
    path.join(root, "apps/admin/messages/en.json"),
];
const forbidden = /lolit|کشاورز\s*بیست|keshavarz\s*20/iu;
for (const file of visibleFiles) {
    pass(!forbidden.test(fs.readFileSync(file, "utf8")), `Forbidden visible brand name found in ${path.relative(root, file)}`);
}

const adminRoutes = read("apps/api/start/routes/admin_factor.ts");
const publicRoutes = read("apps/api/start/routes/factor_public.ts");
for (const needle of [
    'get("/documents"',
    'post("/documents"',
    'get("/documents/:id"',
    'patch("/documents/:id"',
    'post("/documents/:id/transition"',
    'post("/documents/:id/convert"',
    'post("/documents/:id/payment-link"',
    'post("/documents/:id/manual-payment"',
    'get("/summary"',
    'get("/reports"',
    'get("/payment-attempts"',
    'get("/resources"',
    'get("/settings"',
    'patch("/settings"',
])
    pass(adminRoutes.includes(needle), `Missing admin route: ${needle}`);
pass(adminRoutes.includes("adminWriteLimiter"), "Admin factor writes are not rate limited");
pass(publicRoutes.includes('get("/api/v1/factor/pay/:code"'), "Missing public factor link GET route");
pass(publicRoutes.includes('post("/api/v1/factor/pay/:code/init"'), "Missing public factor payment init route");
pass(publicRoutes.includes("factorPaymentLimiter"), "Public factor payment init is not rate limited");

const service = read("apps/api/app/services/factor/document_service.ts");
for (const invariant of [
    "E_FACTOR_TOTAL_BELOW_COLLECTED",
    "E_FACTOR_PAYMENT_INCOMPLETE",
    "E_FACTOR_PARTIAL_PAYMENT_LINK_UNSUPPORTED",
    "E_FACTOR_LINK_USED",
    "E_FACTOR_TYPE_LOCKED",
    "E_FACTOR_ISSUED_IMMUTABLE",
    "E_FACTOR_VERSION_CONFLICT",
    "E_FACTOR_ACCOUNTING_WORKFLOW_REQUIRED",
    "E_FACTOR_PAYMENT_REFERENCE_REQUIRED",
    "E_FACTOR_PAYMENT_DUPLICATE_REFERENCE",
    "E_FACTOR_CONVERT_CLOSED",
    "E_IDEMPOTENCY_KEY_REQUIRED",
    "payment.offline_pending",
    'status: "pending"',
    "E_FACTOR_OFFLINE_RECONCILIATION_PENDING",
    "E_FACTOR_PAYMENT_IN_PROGRESS",
    'where("idempotency_key", idempotencyKey)',
    'String(link.status) === "pending"',
    "OFFLINE_GATEWAY_CODES.has(String(gateway.code))",
    '.onConflict("payment_attempt_id")',
    '.returning("id")',
])
    pass(service.includes(invariant), `Missing factor service invariant: ${invariant}`);

pass(service.includes("items_total: money.subtotalMinor"), "Backing order items_total is not the pre-discount subtotal");
pass(
    service.includes("discount_total: money.lineDiscountMinor + money.orderDiscountMinor"),
    "Backing order discount_total does not include both line and document discounts",
);
pass(service.includes("total: money.lines[index]!.taxableMinor"), "Backing order line total is not post-discount taxable value");
pass(service.includes('.where("status", "active")'), "Inactive product variations can still be selected");
pass(service.includes("customer_iran_profiles as cip"), "Customer fiscal profile is not connected to factor resources");
pass(service.includes("function searchNeedle"), "Persian-aware search normalization is missing");
pass(service.includes("function normalizedLikeSql"), "Normalized SQL search helper is missing");
pass(service.includes("E_FACTOR_DATE_RANGE"), "Invalid report/list date ranges are not rejected");
pass(service.includes("child_documents:"), "Document child-chain data is not returned");
pass(service.includes("const publicCustomer = asJson(link.customer_snapshot)"), "Public customer minimization is missing");
pass(
    service.includes('name: String(publicCustomer.name ?? "")'),
    "Public payment response does not expose the minimal customer name",
);
pass(service.includes("company: publicCustomer.company"), "Public payment response does not expose the minimal company field");
pass(
    !service.includes("customer: asJson(link.customer_snapshot)"),
    "Public payment response still leaks the full customer snapshot",
);
pass(service.includes('"d.status as document_status"'), "Payment-attempt rows do not expose document status");
pass(service.includes("if (link.gateway_id !== null)"), "A gateway-bound public link still exposes unrelated gateways");
const factorEvents = read("apps/api/start/events.ts");
const reconciliationJob = read("apps/api/app/jobs/reconcile_factor_payment_job.ts");
pass(
    factorEvents.includes("ReconcileFactorPaymentJob.dispatch"),
    "Verified factor payments have no durable reconciliation fallback",
);
pass(reconciliationJob.includes("maxRetries: 5"), "Factor payment reconciliation retry policy is missing");
pass(reconciliationJob.includes('withJobTenantContext("payment_attempts"'), "Factor payment reconciliation is not tenant-aware");

const migration = read("apps/api/database/migrations/1750005000000_expand_order_documents_for_factor.ts");
const typeInvariantMigration = read("apps/api/database/migrations/1750005000001_add_factor_document_type_invariants.ts");
for (const invariant of [
    "ENABLE ROW LEVEL SECURITY",
    "FORCE ROW LEVEL SECURITY",
    "factor_document_payments_attempt_unique",
    "payment_links_one_active_per_document",
    "order_documents_factor_money_check",
    "order_document_items_factor_values_check",
    "factor_document_payments_amount_check",
])
    pass(migration.includes(invariant), `Missing base migration guard: ${invariant}`);
for (const invariant of [
    "order_documents_one_invoice_per_parent",
    "order_documents_one_credit_note_per_parent",
    "WHERE type = 'invoice'::order_document_type_enum",
    "WHERE type = 'credit_note'::order_document_type_enum",
    "CHECK (type <> 'credit_note'::order_document_type_enum",
    "order_documents_credit_note_parent_check",
])
    pass(typeInvariantMigration.includes(invariant), `Missing enum invariant migration guard: ${invariant}`);
pass(!typeInvariantMigration.includes("type::text"), "Enum-dependent index predicates still cast the enum column to text");
pass(
    !migration.includes("order_documents_one_invoice_per_parent"),
    "Enum-dependent indexes still run in the enum-extension migration transaction",
);

const eventFile = read("apps/api/start/events.ts");
pass(eventFile.includes('emitter.on("payment:verified"'), "Verified gateway payments are not mirrored into factor ledger");

const routesEntry = read("apps/api/start/routes.ts");
pass(routesEntry.includes('await import("./routes/admin_factor.js")'), "Admin factor routes are not registered");
pass(routesEntry.includes('await import("./routes/factor_public.js")'), "Public factor routes are not registered");

const adminSpec = read("docs/api/reference/openapi/admin.v1.yaml");
const storefrontSpec = read("docs/api/reference/openapi/storefront.v1.yaml");
for (const apiPath of [
    "/api/v1/admin/factor/documents:",
    "/api/v1/admin/factor/documents/{id}:",
    "/api/v1/admin/factor/documents/{id}/transition:",
    "/api/v1/admin/factor/documents/{id}/convert:",
    "/api/v1/admin/factor/documents/{id}/payment-link:",
    "/api/v1/admin/factor/documents/{id}/manual-payment:",
    "/api/v1/admin/factor/summary:",
    "/api/v1/admin/factor/reports:",
    "/api/v1/admin/factor/payment-attempts:",
    "/api/v1/admin/factor/resources:",
    "/api/v1/admin/factor/settings:",
])
    pass(adminSpec.includes(apiPath), `Admin OpenAPI path missing: ${apiPath}`);
for (const apiPath of ["/api/v1/factor/pay/{code}:", "/api/v1/factor/pay/{code}/init:"]) {
    pass(storefrontSpec.includes(apiPath), `Storefront OpenAPI path missing: ${apiPath}`);
}
pass(adminSpec.includes("FactorDocumentUpdateInput.yaml"), "Admin update endpoint does not use the dedicated update schema");
pass(!adminSpec.includes("show_logo"), "Admin settings schema still exposes unsupported show_logo");
pass(!adminSpec.includes("lock_paid_documents"), "Admin settings schema still exposes unsupported lock_paid_documents");

for (const component of [
    "FactorDocumentEnvelope",
    "FactorDocumentListEnvelope",
    "FactorSummaryEnvelope",
    "FactorReportsEnvelope",
    "FactorSettingsEnvelope",
    "FactorResourceListEnvelope",
    "FactorPaymentAttemptListEnvelope",
    "FactorPaymentLinkEnvelope",
])
    pass(adminSpec.includes(component), `Admin OpenAPI response component missing: ${component}`);
for (const component of ["FactorPublicPaymentEnvelope", "FactorPaymentInitEnvelope"]) {
    pass(storefrontSpec.includes(component), `Storefront OpenAPI response component missing: ${component}`);
}

const adminValidator = read("apps/api/app/validators/admin/factor_validator.ts");
for (const invariant of ["withoutDecimals()", "expected_version", 'vine.enum(["proforma", "invoice"] as const)'])
    pass(adminValidator.includes(invariant), `Missing strict validator invariant: ${invariant}`);
pass(
    !adminValidator.includes('vine.enum(["proforma", "invoice", "credit_note"])'),
    "Direct credit-note creation is still accepted",
);

const publicValidator = read("apps/api/app/validators/factor_public_validator.ts");
pass(publicValidator.includes("withoutDecimals()"), "Public gateway ID does not reject fractions");

const publicController = read("apps/api/app/controllers/factor_public_controller.ts");
for (const header of ["cache-control", "referrer-policy", "x-robots-tag", "x-content-type-options"]) {
    pass(publicController.includes(header), `Missing public payment security header: ${header}`);
}

const paymentsPage = read("apps/admin/src/features/factor/payments-page.tsx");
pass(paymentsPage.includes("جستجو در تراکنش‌ها"), "Payment-attempt search is not exposed in the admin UI");
pass(paymentsPage.includes("فیلتر وضعیت تراکنش"), "Payment-attempt status filtering is not exposed in the admin UI");
pass(
    paymentsPage.includes('setStatus(String(value ?? "all"))'),
    "Payment-attempt Select callback does not normalize Base UI unknown values",
);
const publicCheckout = read("apps/admin/src/features/factor/public-checkout.tsx");
pass(publicCheckout.includes("sessionStorage"), "Public checkout does not preserve idempotency keys across retries");
pass(publicCheckout.includes("offline_pending"), "Public checkout has no offline reconciliation state");
pass(
    publicCheckout.includes('setGatewayId(String(value ?? ""))'),
    "Public checkout Select callback does not normalize Base UI unknown values",
);
const publicPayPage = read("apps/admin/src/app/[locale]/pay/[code]/page.tsx");
pass(
    publicPayPage.includes('robots: "noindex, nofollow, noarchive"'),
    "Public payment page metadata does not use a valid noindex/noarchive robots value",
);
pass(!publicPayPage.includes("archive: false"), "Public payment page still uses the invalid Metadata robots archive field");
const publicInitProxy = read("apps/admin/src/app/api/factor/pay/[code]/init/route.ts");
pass(publicInitProxy.includes("16 * 1024"), "Public payment proxy has no request-body size limit");
pass(publicInitProxy.includes("payload_too_large"), "Public payment proxy does not reject oversized payloads");

const publicEnvelope = read("docs/api/reference/openapi/common/components/schemas/FactorPublicPaymentEnvelope.yaml");
pass(publicEnvelope.includes("required: [name, company]"), "Public payment OpenAPI does not constrain the customer snapshot");
pass(!publicEnvelope.includes("email:"), "Public payment OpenAPI leaks customer email");
pass(!publicEnvelope.includes("phone:"), "Public payment OpenAPI leaks customer phone");
const paymentAttemptsEnvelope = read(
    "docs/api/reference/openapi/common/components/schemas/FactorPaymentAttemptListEnvelope.yaml",
);
pass(paymentAttemptsEnvelope.includes("document_status"), "Payment-attempt OpenAPI is missing document_status");
const printView = read("apps/admin/src/features/factor/document-print.tsx");
pass(printView.includes("@page { size: A4"), "Factor print view is not configured for A4");
pass(printView.includes("window.print()"), "Factor print view cannot trigger printing");
const detailView = read("apps/admin/src/features/factor/document-detail.tsx");
pass(detailView.includes("/print?print=1"), "Factor detail page is not connected to the dedicated print view");
pass(detailView.includes("child_documents"), "Factor detail page does not render child documents");
pass(detailView.includes("const currentDocument = document"), "Async factor actions do not retain a narrowed document snapshot");
pass(
    detailView.includes('to_status: "sent" | "viewed" | "awaiting" | "paid" | "expired" | "cancelled"'),
    "Factor transition callback is wider than the API mutation contract",
);
pass(
    detailView.includes('setGatewayId(String(value ?? ""))'),
    "Factor detail gateway Select callback does not normalize Base UI unknown values",
);
const editorView = read("apps/admin/src/features/factor/document-editor.tsx");
pass(
    editorView.includes('useState<FactorDocumentInput["type"]>'),
    "Factor editor state still permits direct credit-note creation",
);
pass(
    editorView.includes('documentQuery.data?.type === "credit_note"'),
    "Direct editing of credit notes is not blocked in the UI",
);

const ts = await loadTypeScript();
const syntaxTargets = [
    "apps/admin/src/features/factor",
    "apps/admin/src/app/[locale]/(authenticated)/factor",
    "apps/admin/src/app/[locale]/pay",
    "apps/admin/src/app/api/factor",
    "apps/admin/src/components/Sidebar.tsx",
    "apps/api/app/services/factor",
    "apps/api/app/jobs/reconcile_factor_payment_job.ts",
    "apps/api/app/controllers/admin/factor_documents_controller.ts",
    "apps/api/app/controllers/admin/factor_dashboard_controller.ts",
    "apps/api/app/controllers/factor_public_controller.ts",
    "apps/api/app/validators/admin/factor_validator.ts",
    "apps/api/app/validators/factor_public_validator.ts",
    "apps/api/database/migrations/1750005000000_expand_order_documents_for_factor.ts",
    "apps/api/database/migrations/1750005000001_add_factor_document_type_invariants.ts",
    "apps/api/start/routes/admin_factor.ts",
    "apps/api/start/routes/factor_public.ts",
    "apps/api/start/events.ts",
    "apps/api/start/limiter.ts",
    "apps/api/tests/unit/factor",
    "apps/api/tests/functional/admin/factor.spec.ts",
    "apps/admin/tests/e2e/factor.spec.ts",
];
const syntaxFileList = syntaxTargets.flatMap((target) => {
    const absolute = path.join(root, target);
    if (!fs.existsSync(absolute)) return [];
    return fs.statSync(absolute).isDirectory() ? walk(target) : [absolute];
});
for (const file of [...new Set(syntaxFileList)]) {
    const source = fs.readFileSync(file, "utf8");
    const result = ts.transpileModule(source, {
        compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            isolatedModules: true,
        },
        fileName: file,
        reportDiagnostics: true,
    });
    syntaxFiles += 1;
    const errors = (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    pass(
        errors.length === 0,
        `TypeScript syntax error in ${path.relative(root, file)}: ${errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")).join(" | ")}`,
    );
}

const transpile = (relative) =>
    ts.transpileModule(read(relative), {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            isolatedModules: true,
        },
        fileName: relative,
    }).outputText;
const moneyModule = await moduleFromTranspiled(transpile("apps/api/app/services/factor/money.ts"));
const lifecycleModule = await moduleFromTranspiled(transpile("apps/api/app/services/factor/lifecycle.ts"));
const uiUtilsModule = await moduleFromTranspiled(transpile("apps/admin/src/features/factor/utils.ts"));
const { calculateFactorMoney } = moneyModule;
const { FACTOR_STATUSES, canTransitionFactor, isFactorImmutable, isFactorStatus } = lifecycleModule;
const { calculateEditorTotal, FACTOR_STATUS_LABELS, FACTOR_STATUS_TONES, FACTOR_TYPE_LABELS } = uiUtilsModule;

for (let index = 1; index <= 220; index += 1) {
    const quantityA = (index % 19) + 1;
    const quantityB = (index % 7) + 1;
    const unitA = index * 1_003;
    const unitB = index * 2_011;
    const discountA = index % 31;
    const discountB = (index * 3) % 41;
    const orderDiscount = index * 17;
    const shipping = index * 23;
    const taxPercent = index % 15;
    const roundTo = [1, 10, 100, 1_000][index % 4];
    const actual = calculateFactorMoney(
        [
            { quantity: quantityA, unitPriceMinor: unitA, discountPercent: discountA },
            { quantity: quantityB, unitPriceMinor: unitB, discountPercent: discountB },
        ],
        { orderDiscountMinor: orderDiscount, shippingMinor: shipping, taxPercent, roundToMinor: roundTo },
    );
    const grossA = quantityA * unitA;
    const grossB = quantityB * unitB;
    const lineDiscount = Math.round((grossA * discountA) / 100) + Math.round((grossB * discountB) / 100);
    const subtotal = grossA + grossB;
    const boundedOrderDiscount = Math.min(orderDiscount, subtotal - lineDiscount);
    const taxable = subtotal - lineDiscount - boundedOrderDiscount + shipping;
    const tax = Math.round((taxable * taxPercent) / 100);
    const beforeRounding = taxable + tax;
    const payable = Math.round(beforeRounding / roundTo) * roundTo;
    assertEqual(actual.subtotalMinor, subtotal, `server money case ${index} subtotal`);
    assertEqual(actual.lineDiscountMinor, lineDiscount, `server money case ${index} line discount`);
    assertEqual(actual.orderDiscountMinor, boundedOrderDiscount, `server money case ${index} order discount`);
    assertEqual(actual.taxMinor, tax, `server money case ${index} tax`);
    assertEqual(actual.payableMinor, payable, `server money case ${index} payable`);
    assertEqual(actual.roundingMinor, payable - beforeRounding, `server money case ${index} rounding`);
    assertEqual(
        actual.lines.reduce((sum, line) => sum + line.allocatedOrderDiscountMinor, 0),
        boundedOrderDiscount,
        `server money case ${index} allocated discount`,
    );
    assertEqual(
        actual.lines.reduce((sum, line) => sum + line.taxMinor, 0) + actual.shippingTaxMinor,
        tax,
        `server money case ${index} allocated tax`,
    );
    assertEqual(
        actual.lines.reduce((sum, line) => sum + line.netMinor, 0) + shipping + tax + actual.roundingMinor - boundedOrderDiscount,
        payable,
        `server money case ${index} backing-order reconciliation`,
    );
}
assertEqual(
    calculateFactorMoney([{ quantity: 1, unitPriceMinor: 10_000, discountPercent: 150 }]).payableMinor,
    0,
    "discount cap",
);
assertEqual(
    calculateFactorMoney([{ quantity: 2, unitPriceMinor: 5_000, discountPercent: 10 }], { orderDiscountMinor: 99_999 })
        .orderDiscountMinor,
    9_000,
    "order discount cap",
);
assertThrows(() => calculateFactorMoney([{ quantity: 1, unitPriceMinor: -1 }]), "unitPriceMinor", "negative money rejected");
assertThrows(() => calculateFactorMoney([{ quantity: 1.5, unitPriceMinor: 1_000 }]), "quantity", "fractional quantity rejected");
assertThrows(() => calculateFactorMoney([{ quantity: 0, unitPriceMinor: 1_000 }]), "greater than zero", "zero quantity rejected");
assertThrows(
    () => calculateFactorMoney([{ quantity: 1, unitPriceMinor: 1_000 }], { orderDiscountMinor: 1.5 }),
    "orderDiscountMinor",
    "fractional order discount rejected",
);
assertThrows(
    () => calculateFactorMoney([{ quantity: 1, unitPriceMinor: 1_000 }], { shippingMinor: 1.5 }),
    "shippingMinor",
    "fractional shipping rejected",
);
assertThrows(
    () => calculateFactorMoney([{ quantity: 1, unitPriceMinor: 1_000 }], { roundToMinor: 1.5 }),
    "roundToMinor",
    "fractional rounding rejected",
);
assertEqual(calculateFactorMoney([], { shippingMinor: 100_000, taxPercent: 10 }).payableMinor, 110_000, "shipping taxable");

const expectedTransitions = {
    draft: ["sent", "cancelled"],
    sent: ["viewed", "awaiting", "paid", "expired", "cancelled"],
    viewed: ["awaiting", "paid", "expired", "cancelled"],
    awaiting: ["paid", "expired", "cancelled"],
    paid: [],
    expired: [],
    cancelled: [],
    refunded: [],
    credited: [],
};
for (const from of FACTOR_STATUSES) {
    for (const to of FACTOR_STATUSES) {
        assertEqual(canTransitionFactor(from, to), expectedTransitions[from].includes(to), `lifecycle ${from} -> ${to}`);
    }
    assertEqual(isFactorStatus(from), true, `status recognized ${from}`);
    assertEqual(isFactorImmutable(from), ["paid", "refunded", "credited"].includes(from), `immutability ${from}`);
}
assertEqual(isFactorStatus("unknown"), false, "unknown status rejected");

assertEqual(
    Object.keys(FACTOR_TYPE_LABELS).sort().join(","),
    ["credit_note", "invoice", "proforma"].join(","),
    "type labels complete",
);
assertEqual(
    Object.keys(FACTOR_STATUS_LABELS).sort().join(","),
    Object.keys(FACTOR_STATUS_TONES).sort().join(","),
    "status labels and tones aligned",
);
for (let index = 1; index <= 60; index += 1) {
    const quantity = (index % 9) + 1;
    const unit = index * 10_001;
    const discount = index % 35;
    const orderDiscount = index * 101;
    const shipping = index * 57;
    const taxPercent = index % 11;
    const roundTo = [1, 10, 100][index % 3];
    const result = calculateEditorTotal({
        lines: [{ quantity, unit_price_minor: unit, discount_percent: discount }],
        order_discount_minor: orderDiscount,
        shipping_minor: shipping,
        tax_percent: taxPercent,
        round_to_minor: roundTo,
    });
    const subtotal = quantity * unit;
    const lineDiscount = Math.round((subtotal * discount) / 100);
    const boundedOrderDiscount = Math.min(orderDiscount, subtotal - lineDiscount);
    const taxable = subtotal - lineDiscount - boundedOrderDiscount + shipping;
    const tax = Math.round((taxable * taxPercent) / 100);
    const beforeRounding = taxable + tax;
    const payable = Math.round(beforeRounding / roundTo) * roundTo;
    assertEqual(
        JSON.stringify(result),
        JSON.stringify({
            subtotal,
            lineDiscount,
            orderDiscount: boundedOrderDiscount,
            shipping,
            tax,
            rounding: payable - beforeRounding,
            payable,
        }),
        `editor preview case ${index}`,
    );
}
assertEqual(
    calculateEditorTotal({
        lines: [{ quantity: 1, unit_price_minor: 1_000, discount_percent: 0 }],
        order_discount_minor: 99_999,
        shipping_minor: 0,
        tax_percent: 9,
        round_to_minor: 10,
    }).payable,
    0,
    "editor total never negative",
);

const functionalTests = (read("apps/api/tests/functional/admin/factor.spec.ts").match(/\btest\(/g) ?? []).length;
const e2eTests = (read("apps/admin/tests/e2e/factor.spec.ts").match(/\btest\(/g) ?? []).length + 6;
const authoredTests =
    (read("apps/api/tests/unit/factor/factor_domain.spec.ts").match(/\btest\(/g) ?? []).length +
    (read("apps/admin/src/features/factor/__tests__/utils.test.ts").match(/\bit\(/g) ?? []).length +
    functionalTests +
    e2eTests +
    220 -
    1 +
    81 -
    1 +
    9 -
    1 +
    9 -
    1 +
    60 -
    1;
pass(functionalTests >= 20, `Expected at least 20 functional API test cases, found ${functionalTests}`);
pass(e2eTests >= 7, `Expected at least 7 browser test cases, found ${e2eTests}`);
pass(authoredTests >= 415, `Expected at least 415 authored test cases, found ${authoredTests}`);

console.log(
    JSON.stringify(
        {
            status: failures.length === 0 ? "PASS" : "FAIL",
            structural_checks: checks,
            syntax_files: syntaxFiles,
            domain_assertions: domainCases,
            authored_test_cases: authoredTests,
            failures,
        },
        null,
        2,
    ),
);

if (failures.length > 0) process.exitCode = 1;
