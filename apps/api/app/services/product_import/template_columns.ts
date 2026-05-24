/**
 * Source of truth for the CSV template served at `GET /api/v1/admin/products/import/template`.
 *
 * Lives in a dedicated module (not inline in the controller) so the test suite can assert against
 * the same constants the endpoint uses — see
 * `tests/functional/admin/product_imports_template.spec.ts` for the trip-wire that fails whenever
 * this list or `IMPORT_FIELDS` drifts without the other being reconsidered.
 *
 * ## Editing rules
 *
 * 1. Every header in {@link TEMPLATE_HEADERS} MUST be a key in `IMPORT_FIELDS` — otherwise the
 *    template downloads as a file the importer's auto-mapping can't recognize.
 * 2. Every row in {@link TEMPLATE_SAMPLE_ROWS} MUST have `TEMPLATE_HEADERS.length` columns —
 *    otherwise Excel renders ragged rows.
 * 3. When you add a new field to `IMPORT_FIELDS`, deliberately decide whether it belongs in the
 *    template too. The trip-wire test will fail and the failure message tells you how to update.
 */

export const TEMPLATE_HEADERS = [
    "sku",
    "name",
    "type",
    "status",
    "regular_price",
    "sale_price",
    "stock_quantity",
    "stock_status",
    "categories",
    "tags",
    "brand",
    "short_description",
    "description",
    "weight",
    "length",
    "width",
    "height",
    "images",
    "parent_sku",
    "external_url",
] as const;

export type TemplateHeader = (typeof TEMPLATE_HEADERS)[number];

export const TEMPLATE_SAMPLE_ROWS: ReadonlyArray<ReadonlyArray<string>> = [
    [
        "saf-001",
        "کفش ساده مشکی",
        "simple",
        "publish",
        "1500000",
        "1290000",
        "20",
        "instock",
        "کفش > روزانه",
        "مشکی,راحت",
        "Nike",
        "کفش ساده روزمره",
        "",
        "500",
        "300",
        "200",
        "150",
        "https://example.com/saf-001.jpg",
        "",
        "",
    ],
    [
        "var-001",
        "تیشرت تابستانی",
        "variable",
        "publish",
        "750000",
        "",
        "",
        "instock",
        "پوشاک > تیشرت",
        "تابستانه",
        "Adidas",
        "تیشرت تابستانی نخی",
        "تیشرت تابستانی نخی با کیفیت بالا",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
    ],
    ["var-001-red-m", "", "", "publish", "750000", "", "8", "instock", "", "", "", "", "", "", "", "", "", "", "var-001", ""],
];
