/**
 * Wire-shape types for the CSV product exporter endpoints. Mirrors `lib/imports/types.ts` so
 * the wizard's component shapes stay consistent across the two flows. Replace with
 * `AdminSchemas["…"]` types once the export endpoints land in the OpenAPI spec.
 */

export type ProductExportStatus = "queued" | "running" | "completed" | "completed_with_errors" | "failed" | "cancelled";

export type ProductExportScope = "all" | "filter" | "selected" | "preset";

/**
 * Shared filter envelope. Every dimension matches `exportFiltersSchema` on the API side; the
 * count, preview, and start endpoints all accept the same object.
 */
export interface ExportFilters {
    status?: string[];
    type?: string[];
    categories?: number[];
    include_descendant_categories?: boolean;
    brands?: number[];
    tags?: number[];
    tags_match?: "any" | "all";
    stock_status?: string[];
    low_stock?: boolean;
    low_stock_threshold?: number;
    price_min?: number;
    price_max?: number;
    on_sale?: boolean;
    featured?: boolean;
    has_images?: boolean;
    has_variations?: boolean;
    include_variations?: boolean;
    tax_class?: string[];
    shipping_class?: string[];
    created_after?: string;
    created_before?: string;
    updated_after?: string;
    updated_before?: string;
    sku_pattern?: string;
    search?: string;
    attributes?: Array<{ attribute_id: number; term_ids: number[] }>;
    ids?: number[];
    with_trashed?: boolean;
}

export interface ExportFormatOptions {
    format?: "csv" | "json";
    delimiter?: "," | ";" | "\t";
    enclosure?: string;
    encoding?: "utf-8-bom" | "utf-8" | "windows-1256";
    line_ending?: "\n" | "\r\n";
    digit_style?: "ascii" | "persian";
    date_format?: "iso" | "jalali" | "ddmmyyyy";
    money_format?: "minor" | "major";
    compress?: "auto" | "always" | "never";
    redact_pii?: boolean;
    header_language?: "en" | "fa";
    include_meta?: boolean;
    meta_strategy?: "all" | "min_count" | "selected";
    meta_min_count?: number;
    meta_keys?: string[];
    show_hidden_meta?: boolean;
    include_variations?: boolean;
}

export interface ProductExportRow {
    id: number;
    user_id: number;
    status: ProductExportStatus;
    scope: ProductExportScope;
    preset_id: number | null;
    filters: ExportFilters;
    columns: string[];
    format_options: ExportFormatOptions;
    original_filename: string;
    file_size_bytes: number;
    compressed: boolean;
    has_file: boolean;
    download_expires_at: string | null;
    is_downloadable: boolean;
    total_rows: number;
    processed_rows: number;
    started_at: string | null;
    finished_at: string | null;
    cancellation_requested_at: string | null;
    exception: string | null;
    created_at: string | null;
    updated_at: string | null;
}

export interface ExportPreviewResult {
    columns: string[];
    rows: Array<Record<string, string>>;
}

export interface ExportCount {
    products: number;
    variations: number;
    total_rows: number;
}

export interface ProductExportPreset {
    id: number;
    user_id: number;
    name: string;
    filters: ExportFilters;
    columns: string[];
    format_options: ExportFormatOptions;
    is_default: boolean;
    last_used_at: string | null;
    created_at: string | null;
    updated_at: string | null;
}

/**
 * SSE event payloads — every event the runner publishes through the in-process bus. Keep this
 * union in lockstep with `ExportEventType` in `apps/api/app/services/product_export/event_bus.ts`.
 */
export type ProductExportStreamEvent =
    | {
          type: "reading_products" | "chunk_start" | "chunk_complete" | "slow_chunk";
          at: string;
          payload?: {
              status?: ProductExportStatus;
              processed?: number;
              total?: number;
              total_products?: number;
              offset?: number;
              size?: number;
              bytes_written?: number;
          };
      }
    | { type: "compressing"; at: string; payload?: undefined }
    | {
          type: "complete";
          at: string;
          payload?: {
              file_size?: number;
              row_count?: number;
              compressed?: boolean;
              /** Raw signed-URL token the wizard ships to the download endpoint. */
              token?: string;
          };
      }
    | { type: "failed"; at: string; payload?: { message: string } }
    | { type: "cancelled"; at: string; payload?: undefined };
