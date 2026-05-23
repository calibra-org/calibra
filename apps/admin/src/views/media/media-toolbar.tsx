"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Calendar, CheckSquare, Filter, LayoutGrid, List, Search, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { cn } from "#/lib/utils";

import { formatMonthLabel, type MediaTypeFilter, type MediaViewMode } from "./types";

interface MediaToolbarProps {
    search: string;
    onSearchChange: (value: string) => void;
    type: MediaTypeFilter;
    onTypeChange: (value: MediaTypeFilter) => void;
    month: string;
    onMonthChange: (value: string) => void;
    months: readonly string[];
    view: MediaViewMode;
    onViewChange: (value: MediaViewMode) => void;
    bulkMode: boolean;
    onBulkModeChange: (value: boolean) => void;
    onAdd: () => void;
    locale: Locale;
}

const TYPE_OPTIONS: MediaTypeFilter[] = ["all", "image", "audio", "video", "document", "spreadsheet", "archive", "unattached", "mine"];

/**
 * Two-row toolbar. The action cluster (Add media · Bulk select · View toggle) sits at the start
 * of the first row so the operator can find primary actions without scanning past filters; the
 * filter row underneath holds search + the two dropdowns. Only the primary CTA (Add media) is
 * filled — the bulk toggle and view toggle use subtle outline / segmented styling so a screen
 * full of buttons doesn't read as a wall of blue.
 */
export function MediaToolbar({
    search,
    onSearchChange,
    type,
    onTypeChange,
    month,
    onMonthChange,
    months,
    view,
    onViewChange,
    bulkMode,
    onBulkModeChange,
    onAdd,
    locale,
}: MediaToolbarProps) {
    const t = useTranslations("Media");
    const tToolbar = useTranslations("Media.toolbar");
    const tTypes = useTranslations("Media.mediaTypes");
    const tDate = useTranslations("Media.dateFilter");
    const tMonth = useTranslations("Media.monthNames");
    const tViewToggle = useTranslations("Media.viewToggle");

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" className="h-9 gap-1.5" onClick={onAdd}>
                    <Upload className="size-3.5" aria-hidden="true" />
                    {t("addButton")}
                </Button>

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                        "h-9 gap-1.5",
                        bulkMode && "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10",
                    )}
                    onClick={() => onBulkModeChange(!bulkMode)}
                    aria-pressed={bulkMode}
                >
                    {bulkMode ? (
                        <X className="size-3.5" aria-hidden="true" />
                    ) : (
                        <CheckSquare className="size-3.5" aria-hidden="true" />
                    )}
                    {bulkMode ? t("bulkToggleExit") : t("bulkToggle")}
                </Button>

                <div className="inline-flex items-center rounded-md border border-border/60 bg-background p-0.5">
                    <ViewToggleButton
                        icon={LayoutGrid}
                        label={tViewToggle("grid")}
                        active={view === "grid"}
                        onClick={() => onViewChange("grid")}
                    />
                    <ViewToggleButton
                        icon={List}
                        label={tViewToggle("list")}
                        active={view === "list"}
                        onClick={() => onViewChange("list")}
                    />
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[12rem] flex-1">
                    <Search
                        className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <Input
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder={tToolbar("searchPlaceholder")}
                        className="h-9 ps-9"
                    />
                    {search.length > 0 && (
                        <button
                            type="button"
                            aria-label={tToolbar("clearSearch")}
                            onClick={() => onSearchChange("")}
                            className="absolute end-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            <X className="size-3.5" aria-hidden="true" />
                        </button>
                    )}
                </div>

                <Select value={type} onValueChange={(value) => onTypeChange(value as MediaTypeFilter)}>
                    <SelectTrigger className="h-9 w-[14rem] gap-2" aria-label={tTypes("all")}>
                        <Filter className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <SelectValue className="flex-1 truncate text-start">
                            {(value) => {
                                const key = typeof value === "string" && value.length > 0 ? value : "all";
                                return tTypes(key as Parameters<typeof tTypes>[0]);
                            }}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                                {tTypes(option as Parameters<typeof tTypes>[0])}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select
                    value={month === "" ? "all" : month}
                    onValueChange={(value) => {
                        const next = typeof value === "string" ? value : "";
                        onMonthChange(next === "all" ? "" : next);
                    }}
                >
                    <SelectTrigger className="h-9 w-[14rem] gap-2" aria-label={tDate("all")}>
                        <Calendar className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <SelectValue className="flex-1 truncate text-start">
                            {(value) => {
                                if (typeof value !== "string" || value.length === 0 || value === "all") return tDate("all");
                                return formatMonthLabel(value, locale, (key) => tMonth(key as Parameters<typeof tMonth>[0]));
                            }}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{tDate("all")}</SelectItem>
                        {months.map((bucket) => (
                            <SelectItem key={bucket} value={bucket}>
                                {formatMonthLabel(bucket, locale, (key) => tMonth(key as Parameters<typeof tMonth>[0]))}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

interface ViewToggleButtonProps {
    icon: typeof LayoutGrid;
    label: string;
    active: boolean;
    onClick: () => void;
}

function ViewToggleButton({ icon: Icon, label, active, onClick }: ViewToggleButtonProps) {
    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors",
                active ? "bg-foreground/10 text-foreground" : "hover:bg-muted hover:text-foreground",
            )}
        >
            <Icon className="size-3.5" aria-hidden="true" />
        </button>
    );
}
