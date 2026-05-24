"use client";

import { toPersianDigits } from "@calibra/shared/digits";
import { ArrowRight, ChevronDown, FileDown, Filter, GripVertical, Loader2, Sliders, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Spinner } from "#/components/ui/spinner";
import { getExportCount, getExportPreview } from "#/lib/exports/api";
import { type ColumnPresetId, columnsForPreset, DEFAULT_EXPORT_COLUMNS } from "#/lib/exports/default-columns";
import type {
    ExportCount,
    ExportFilters,
    ExportFormatOptions,
    ExportPreviewResult,
    ProductExportScope,
} from "#/lib/exports/types";
import { cn } from "#/lib/utils";

import type { FilterState } from "./wizard-state";

export interface StepFilterAndColumnsProps {
    state: FilterState;
    onChange: (next: Partial<FilterState>) => void;
    /**
     * Hand-off to the review step. Receives the preview server returned + the match count so the
     * wizard owner can build the ReviewState in one shot.
     */
    onReview: (args: {
        preview: ExportPreviewResult;
        matchCount: { products: number; variations: number; total_rows: number };
    }) => void;
}

const PRODUCT_STATUSES = ["publish", "draft", "pending", "private"] as const;
const PRODUCT_TYPES = ["simple", "variable", "grouped", "external"] as const;
const STOCK_STATUSES = ["instock", "outofstock", "onbackorder"] as const;
const COLUMN_PRESET_IDS: ColumnPresetId[] = ["default", "all", "required", "pricing", "none"];

/**
 * Step 1 — full filter surface + column picker + format options + live count + 5-row preview.
 *
 * The filter panel keeps things simple by listing the 15+ filter dimensions as labelled rows
 * rather than collapsing them into a fancy faceted UI. Operators can scroll. Every toggle / input
 * change debounces a `getExportCount` call so the count chip up top always reflects what'll be
 * exported.
 *
 * The column picker is a single grouped checklist; reordering uses HTML5 drag-and-drop without
 * pulling in a new dep — the move handle stamps the drop target index when the operator releases.
 */
export function StepFilterAndColumns({ state, onChange, onReview }: StepFilterAndColumnsProps): React.JSX.Element {
    const t = useTranslations("ProductsExport.step1");
    const locale = useLocale();
    const fmt = useCallback((n: number) => (locale === "fa" ? toPersianDigits(n) : String(n)), [locale]);

    const [count, setCount] = useState<ExportCount | null>(null);
    const [countLoading, setCountLoading] = useState(false);
    const [startLoading, setStartLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const filtersForRequest = useMemo<ExportFilters>(() => {
        if (state.scope === "selected" && state.selectedIds.length > 0) {
            return { ...state.filters, ids: state.selectedIds };
        }
        return state.filters;
    }, [state.filters, state.scope, state.selectedIds]);

    /** Debounced live-count refresher. Re-runs 300ms after the operator stops poking the form. */
    useEffect(() => {
        setCountLoading(true);
        const timer = setTimeout(() => {
            getExportCount(filtersForRequest, locale)
                .then(({ data }) => setCount(data))
                .catch(() => setCount({ products: 0, variations: 0, total_rows: 0 }))
                .finally(() => setCountLoading(false));
        }, 300);
        return () => clearTimeout(timer);
    }, [filtersForRequest, locale]);

    const updateFilter = useCallback(
        (next: Partial<ExportFilters>) => {
            onChange({ filters: { ...state.filters, ...next } });
        },
        [onChange, state.filters],
    );

    const toggleArrayFilter = useCallback(
        <K extends keyof ExportFilters>(key: K, value: string, checked: boolean) => {
            const existing = (state.filters[key] as unknown as string[] | undefined) ?? [];
            const next = checked ? [...existing, value] : existing.filter((v) => v !== value);
            updateFilter({ [key]: next.length > 0 ? next : undefined } as Partial<ExportFilters>);
        },
        [state.filters, updateFilter],
    );

    const handlePresetColumns = useCallback(
        (presetId: ColumnPresetId) => {
            onChange({ columns: columnsForPreset(presetId) });
        },
        [onChange],
    );

    const toggleColumn = useCallback(
        (key: string, checked: boolean) => {
            const next = checked ? [...state.columns, key] : state.columns.filter((c) => c !== key);
            onChange({ columns: next });
        },
        [onChange, state.columns],
    );

    /**
     * "Continue to review" — fetches the 5-row preview against the current filter + column
     * selection, then hands off to Step 2 so the operator can inspect before pulling the
     * trigger. The actual `startExport` call now lives in the review step.
     */
    const handleContinue = useCallback(async () => {
        setError(null);
        setStartLoading(true);
        try {
            const { data } = await getExportPreview(
                {
                    ...filtersForRequest,
                    columns: state.columns,
                    digit_style: state.format.digit_style,
                    date_format: state.format.date_format,
                    money_format: state.format.money_format,
                    header_language: state.format.header_language,
                },
                locale,
            );
            onReview({
                preview: data,
                matchCount: count ?? { products: 0, variations: 0, total_rows: 0 },
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : t("previewFailed"));
        } finally {
            setStartLoading(false);
        }
    }, [count, filtersForRequest, locale, onReview, state.columns, state.format, t]);

    const canStart = state.columns.length > 0 && (count?.total_rows ?? 0) > 0 && !startLoading && !countLoading;

    return (
        <article className="flex flex-col gap-4">
            <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-xs">
                <header className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="font-semibold text-xl tracking-tight">{t("title")}</h2>
                        <p className="mt-1 text-muted-foreground text-sm">{t("subtitle")}</p>
                    </div>
                    <MatchCount count={count} loading={countLoading} fmt={fmt} />
                </header>
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <section className="flex flex-col gap-4">
                    <ScopeToggle state={state} onChange={onChange} t={t} fmt={fmt} count={count} />
                    <FilterPanel state={state} updateFilter={updateFilter} toggleArrayFilter={toggleArrayFilter} t={t} />
                </section>

                <aside className="flex flex-col gap-4">
                    <ColumnPicker
                        columns={state.columns}
                        onToggle={toggleColumn}
                        onPreset={handlePresetColumns}
                        onReorder={(next) => onChange({ columns: next })}
                        t={t}
                    />
                    <FormatPanel
                        format={state.format}
                        onChange={(next) => onChange({ format: { ...state.format, ...next } })}
                        open={advancedOpen}
                        onToggle={setAdvancedOpen}
                        t={t}
                    />
                </aside>
            </div>

            {error !== null ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
                    {error}
                </div>
            ) : null}

            <footer className="flex flex-wrap items-center justify-end gap-2 rounded-lg border bg-card p-4 text-card-foreground shadow-xs">
                <Button
                    onClick={handleContinue}
                    disabled={!canStart}
                    size="lg"
                    title={
                        state.columns.length === 0
                            ? t("disabledNoColumns")
                            : (count?.total_rows ?? 0) === 0
                              ? t("disabledNoMatches")
                              : undefined
                    }
                >
                    {startLoading ? <Spinner /> : <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />}
                    {t("continueToReview")}
                </Button>
            </footer>
        </article>
    );
}

interface MatchCountProps {
    count: ExportCount | null;
    loading: boolean;
    fmt: (n: number) => string;
}

function MatchCount({ count, loading, fmt }: MatchCountProps): React.JSX.Element {
    const t = useTranslations("ProductsExport.matchCount");
    return (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            {loading ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
            ) : (
                <Filter className="size-4 text-muted-foreground" aria-hidden />
            )}
            <span className="text-muted-foreground">{t("label")}</span>
            <span className="font-semibold text-base">{fmt(count?.products ?? 0)}</span>
            {(count?.variations ?? 0) > 0 ? (
                <span className="text-muted-foreground text-xs">
                    + {fmt(count?.variations ?? 0)} {t("variations")}
                </span>
            ) : null}
        </div>
    );
}

interface ScopeToggleProps {
    state: FilterState;
    onChange: (next: Partial<FilterState>) => void;
    t: (key: string, params?: Record<string, string | number | Date>) => string;
    fmt: (n: number) => string;
    count: ExportCount | null;
}

function ScopeToggle({ state, onChange, fmt }: ScopeToggleProps): React.JSX.Element {
    const t = useTranslations("ProductsExport.scope");
    const tBase = useTranslations("ProductsExport.step1");
    const options: Array<{ id: ProductExportScope; label: string; help: string; disabled?: boolean }> = [
        { id: "all", label: t("all"), help: t("allHelp") },
        { id: "filter", label: t("filter"), help: t("filterHelp") },
        {
            id: "selected",
            label: t("selected"),
            help: t("selectedHelp", { n: fmt(state.selectedIds.length) }),
            disabled: state.selectedIds.length === 0,
        },
    ];
    return (
        <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-xs">
            <header className="flex items-center gap-2">
                <Filter className="size-4 text-muted-foreground" aria-hidden />
                <h3 className="font-semibold text-base">{tBase("scopeTitle")}</h3>
            </header>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {options.map((opt) => (
                    <button
                        key={opt.id}
                        type="button"
                        disabled={opt.disabled === true}
                        onClick={() => {
                            const next: Partial<FilterState> = { scope: opt.id };
                            if (opt.id === "all") next.filters = {};
                            onChange(next);
                        }}
                        className={cn(
                            "flex flex-col items-start gap-1 rounded-md border p-3 text-start text-sm transition-colors",
                            state.scope === opt.id ? "border-primary bg-primary/5" : "hover:bg-accent",
                            opt.disabled && "cursor-not-allowed opacity-50",
                        )}
                    >
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-muted-foreground text-xs">{opt.help}</span>
                    </button>
                ))}
            </div>
        </section>
    );
}

interface FilterPanelProps {
    state: FilterState;
    updateFilter: (next: Partial<ExportFilters>) => void;
    toggleArrayFilter: <K extends keyof ExportFilters>(key: K, value: string, checked: boolean) => void;
    t: (key: string, params?: Record<string, string | number | Date>) => string;
}

function FilterPanel({ state, updateFilter, toggleArrayFilter }: FilterPanelProps): React.JSX.Element {
    const t = useTranslations("ProductsExport.filters");
    const tStatus = useTranslations("ProductsExport.statusLabels");
    const tType = useTranslations("ProductsExport.typeLabels");
    const tStock = useTranslations("ProductsExport.stockLabels");

    return (
        <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-xs">
            <header className="flex items-center gap-2">
                <Sliders className="size-4 text-muted-foreground" aria-hidden />
                <h3 className="font-semibold text-base">{t("title")}</h3>
            </header>

            <div className="mt-4 flex flex-col gap-4">
                <FilterRow label={t("status")}>
                    {PRODUCT_STATUSES.map((s) => (
                        <ChipToggle
                            key={s}
                            label={tStatus(s)}
                            checked={(state.filters.status ?? []).includes(s)}
                            onCheckedChange={(value) => toggleArrayFilter("status", s, value)}
                        />
                    ))}
                </FilterRow>

                <FilterRow label={t("type")}>
                    {PRODUCT_TYPES.map((s) => (
                        <ChipToggle
                            key={s}
                            label={tType(s)}
                            checked={(state.filters.type ?? []).includes(s)}
                            onCheckedChange={(value) => toggleArrayFilter("type", s, value)}
                        />
                    ))}
                </FilterRow>

                <FilterRow label={t("stockStatus")}>
                    {STOCK_STATUSES.map((s) => (
                        <ChipToggle
                            key={s}
                            label={tStock(s)}
                            checked={(state.filters.stock_status ?? []).includes(s)}
                            onCheckedChange={(value) => toggleArrayFilter("stock_status", s, value)}
                        />
                    ))}
                </FilterRow>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <BoolFilterRow
                        label={t("onSale")}
                        checked={state.filters.on_sale === true}
                        onCheckedChange={(v) => updateFilter({ on_sale: v ? true : undefined })}
                    />
                    <BoolFilterRow
                        label={t("featured")}
                        checked={state.filters.featured === true}
                        onCheckedChange={(v) => updateFilter({ featured: v ? true : undefined })}
                    />
                    <BoolFilterRow
                        label={t("hasImages")}
                        checked={state.filters.has_images === true}
                        onCheckedChange={(v) => updateFilter({ has_images: v ? true : undefined })}
                    />
                    <BoolFilterRow
                        label={t("hasVariations")}
                        checked={state.filters.has_variations === true}
                        onCheckedChange={(v) => updateFilter({ has_variations: v ? true : undefined })}
                    />
                    <BoolFilterRow
                        label={t("lowStock")}
                        checked={state.filters.low_stock === true}
                        onCheckedChange={(v) => updateFilter({ low_stock: v ? true : undefined })}
                    />
                    <BoolFilterRow
                        label={t("includeVariations")}
                        checked={state.filters.include_variations === true}
                        onCheckedChange={(v) => updateFilter({ include_variations: v ? true : undefined })}
                    />
                </div>

                <FilterRow label={t("priceRange")}>
                    <NumberInput
                        placeholder={t("min")}
                        value={state.filters.price_min}
                        onChange={(v) => updateFilter({ price_min: v })}
                    />
                    <NumberInput
                        placeholder={t("max")}
                        value={state.filters.price_max}
                        onChange={(v) => updateFilter({ price_max: v })}
                    />
                </FilterRow>

                <FilterRow label={t("skuPattern")}>
                    <Input
                        value={state.filters.sku_pattern ?? ""}
                        onChange={(e) => updateFilter({ sku_pattern: e.target.value === "" ? undefined : e.target.value })}
                        placeholder={t("skuPatternPlaceholder")}
                        className="max-w-xs"
                    />
                </FilterRow>

                <FilterRow label={t("search")}>
                    <Input
                        value={state.filters.search ?? ""}
                        onChange={(e) => updateFilter({ search: e.target.value === "" ? undefined : e.target.value })}
                        placeholder={t("searchPlaceholder")}
                        className="max-w-md"
                    />
                </FilterRow>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FilterRow label={t("createdAfter")}>
                        <Input
                            type="date"
                            value={state.filters.created_after ?? ""}
                            onChange={(e) => updateFilter({ created_after: e.target.value === "" ? undefined : e.target.value })}
                        />
                    </FilterRow>
                    <FilterRow label={t("createdBefore")}>
                        <Input
                            type="date"
                            value={state.filters.created_before ?? ""}
                            onChange={(e) => updateFilter({ created_before: e.target.value === "" ? undefined : e.target.value })}
                        />
                    </FilterRow>
                </div>
            </div>
        </section>
    );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
    return (
        <div className="flex flex-col gap-1.5">
            <Label className="text-muted-foreground text-xs uppercase">{label}</Label>
            <div className="flex flex-wrap items-center gap-2">{children}</div>
        </div>
    );
}

function BoolFilterRow({
    label,
    checked,
    onCheckedChange,
}: {
    label: string;
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
}): React.JSX.Element {
    const id = `bool-filter-${label.replace(/\s+/g, "-")}`;
    return (
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3 text-sm hover:bg-muted/50">
            <Checkbox id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
            <Label htmlFor={id} className="cursor-pointer">
                {label}
            </Label>
        </div>
    );
}

function ChipToggle({
    label,
    checked,
    onCheckedChange,
}: {
    label: string;
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
}): React.JSX.Element {
    return (
        <button
            type="button"
            onClick={() => onCheckedChange(!checked)}
            className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                checked ? "border-primary bg-primary/15 text-primary" : "hover:bg-accent",
            )}
        >
            {label}
        </button>
    );
}

function NumberInput({
    value,
    onChange,
    placeholder,
}: {
    value: number | undefined;
    onChange: (next: number | undefined) => void;
    placeholder: string;
}): React.JSX.Element {
    return (
        <Input
            type="number"
            inputMode="numeric"
            value={value ?? ""}
            onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") onChange(undefined);
                else {
                    const num = Number(raw);
                    onChange(Number.isFinite(num) ? num : undefined);
                }
            }}
            placeholder={placeholder}
            className="max-w-32"
        />
    );
}

interface ColumnPickerProps {
    columns: string[];
    onToggle: (key: string, checked: boolean) => void;
    onPreset: (id: ColumnPresetId) => void;
    onReorder: (next: string[]) => void;
    t: (key: string, params?: Record<string, string | number | Date>) => string;
}

function ColumnPicker({ columns, onToggle, onPreset, onReorder }: ColumnPickerProps): React.JSX.Element {
    const t = useTranslations("ProductsExport.columns");
    const tField = useTranslations("ProductsImport.fields");
    const allFields = DEFAULT_EXPORT_COLUMNS;
    const draggingIdx = useRef<number | null>(null);

    const handleDragStart = (idx: number) => {
        draggingIdx.current = idx;
    };
    const handleDrop = (targetIdx: number) => {
        const source = draggingIdx.current;
        draggingIdx.current = null;
        if (source === null || source === targetIdx) return;
        const next = [...columns];
        const [moved] = next.splice(source, 1);
        if (moved !== undefined) next.splice(targetIdx, 0, moved);
        onReorder(next);
    };

    return (
        <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-xs">
            <header className="flex items-center gap-2">
                <FileDown className="size-4 text-muted-foreground" aria-hidden />
                <h3 className="font-semibold text-base">{t("title")}</h3>
            </header>
            <p className="mt-1 text-muted-foreground text-xs">{t("subtitle")}</p>

            <div className="mt-3 flex flex-wrap gap-1.5">
                {COLUMN_PRESET_IDS.map((id) => (
                    <Button key={id} variant="outline" size="sm" onClick={() => onPreset(id)}>
                        {t(`preset.${id}`)}
                    </Button>
                ))}
            </div>

            <ul className="mt-4 max-h-72 space-y-1 overflow-y-auto pr-1">
                {columns.map((key, idx) => (
                    <li
                        key={key}
                        draggable
                        aria-label={key}
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(idx)}
                        className="flex items-center gap-2 rounded-md border bg-primary/5 p-2 text-sm"
                    >
                        <GripVertical className="size-3.5 cursor-grab text-muted-foreground" aria-hidden />
                        <span className="flex-1 truncate">{safeFieldLabel(tField, key)}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                            {key}
                        </Badge>
                        <button
                            type="button"
                            aria-label={t("remove")}
                            onClick={() => onToggle(key, false)}
                            className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                            <X className="size-3.5" aria-hidden />
                        </button>
                    </li>
                ))}
            </ul>

            <details className="mt-4 rounded-md border">
                <summary className="flex cursor-pointer items-center justify-between p-2 text-sm">
                    <span className="text-muted-foreground">{t("addMore")}</span>
                    <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
                </summary>
                <div className="max-h-60 overflow-y-auto p-2">
                    {allFields
                        .filter((k) => !columns.includes(k))
                        .map((key) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => onToggle(key, true)}
                                className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                            >
                                <span>{safeFieldLabel(tField, key)}</span>
                                <Badge variant="outline" className="font-mono text-[10px]">
                                    {key}
                                </Badge>
                            </button>
                        ))}
                </div>
            </details>
        </section>
    );
}

interface FormatPanelProps {
    format: ExportFormatOptions;
    onChange: (next: Partial<ExportFormatOptions>) => void;
    open: boolean;
    onToggle: (next: boolean) => void;
    t: (key: string, params?: Record<string, string | number | Date>) => string;
}

function FormatPanel({ format, onChange, open, onToggle }: FormatPanelProps): React.JSX.Element {
    const t = useTranslations("ProductsExport.format");
    return (
        <section className="rounded-lg border bg-card text-card-foreground shadow-xs">
            <button
                type="button"
                onClick={() => onToggle(!open)}
                className="flex w-full items-center justify-between gap-2 p-5 text-start"
            >
                <span className="font-semibold text-base">{t("title")}</span>
                <ChevronDown
                    className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
                    aria-hidden
                />
            </button>
            {open ? (
                <div className="grid grid-cols-1 gap-3 border-t p-5 sm:grid-cols-2">
                    <SelectRow
                        label={t("delimiter")}
                        value={format.delimiter ?? ","}
                        onChange={(v) => onChange({ delimiter: v as ExportFormatOptions["delimiter"] })}
                        options={[
                            { value: ",", label: "," },
                            { value: ";", label: ";" },
                            { value: "\t", label: t("tab") },
                        ]}
                    />
                    <SelectRow
                        label={t("encoding")}
                        value={format.encoding ?? "utf-8-bom"}
                        onChange={(v) => onChange({ encoding: v as ExportFormatOptions["encoding"] })}
                        options={[
                            { value: "utf-8-bom", label: "UTF-8 (BOM)" },
                            { value: "utf-8", label: "UTF-8" },
                            { value: "windows-1256", label: "Windows-1256" },
                        ]}
                    />
                    <SelectRow
                        label={t("digitStyle")}
                        value={format.digit_style ?? "ascii"}
                        onChange={(v) => onChange({ digit_style: v as ExportFormatOptions["digit_style"] })}
                        options={[
                            { value: "ascii", label: t("digitStyleAscii") },
                            { value: "persian", label: t("digitStylePersian") },
                        ]}
                    />
                    <SelectRow
                        label={t("dateFormat")}
                        value={format.date_format ?? "iso"}
                        onChange={(v) => onChange({ date_format: v as ExportFormatOptions["date_format"] })}
                        options={[
                            { value: "iso", label: "ISO 8601" },
                            { value: "jalali", label: t("jalali") },
                            { value: "ddmmyyyy", label: "DD/MM/YYYY" },
                        ]}
                    />
                    <SelectRow
                        label={t("moneyFormat")}
                        value={format.money_format ?? "minor"}
                        onChange={(v) => onChange({ money_format: v as ExportFormatOptions["money_format"] })}
                        options={[
                            { value: "minor", label: t("moneyMinor") },
                            { value: "major", label: t("moneyMajor") },
                        ]}
                    />
                    <SelectRow
                        label={t("compress")}
                        value={format.compress ?? "auto"}
                        onChange={(v) => onChange({ compress: v as ExportFormatOptions["compress"] })}
                        options={[
                            { value: "auto", label: t("compressAuto") },
                            { value: "always", label: t("compressAlways") },
                            { value: "never", label: t("compressNever") },
                        ]}
                    />
                    <SelectRow
                        label={t("headerLanguage")}
                        value={format.header_language ?? "en"}
                        onChange={(v) => onChange({ header_language: v as ExportFormatOptions["header_language"] })}
                        options={[
                            { value: "en", label: t("headerEn") },
                            { value: "fa", label: t("headerFa") },
                        ]}
                    />
                </div>
            ) : null}
        </section>
    );
}

function SelectRow({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: string;
    onChange: (next: string) => void;
    options: Array<{ value: string; label: string }>;
}): React.JSX.Element {
    /**
     * Native `<select>` ships a browser-default chevron that doesn't match our design system and
     * sits on the wrong side under RTL. Strip it with `appearance-none` and overlay a real Lucide
     * chevron at the LOGICAL end (`end-3` flips with locale direction).
     */
    return (
        <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs">{label}</Label>
            <div className="relative">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={cn(
                        "h-9 w-full appearance-none rounded-md border bg-background ps-3 pe-9 text-sm shadow-xs outline-none",
                        "hover:border-ring/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    )}
                >
                    {options.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
                <ChevronDown
                    className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                />
            </div>
        </div>
    );
}

function safeFieldLabel(t: (key: string) => string, key: string): string {
    try {
        const value = t(`${key}.label`);
        return typeof value === "string" && value.length > 0 ? value : key;
    } catch {
        return key;
    }
}
