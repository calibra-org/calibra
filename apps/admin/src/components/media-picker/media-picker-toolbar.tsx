"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Calendar, Filter, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { formatMonthLabel, type MediaTypeFilter } from "#/views/media/types";

interface MediaPickerToolbarProps {
    search: string;
    onSearchChange: (value: string) => void;
    type: MediaTypeFilter;
    onTypeChange: (value: MediaTypeFilter) => void;
    month: string;
    onMonthChange: (value: string) => void;
    months: readonly string[];
    locale: Locale;
}

const TYPE_OPTIONS: MediaTypeFilter[] = ["all", "image", "audio", "video", "document", "spreadsheet", "archive"];

/**
 * Slim filter bar — search + type + month, mirroring the workbench toolbar minus the view toggle,
 * the bulk mode toggle, and the "Add media" CTA (the picker has a dedicated Upload tab for that).
 * Only the type list is trimmed: `unattached` and `mine` aren't meaningful when the operator is
 * picking an image to attach somewhere.
 */
export function MediaPickerToolbar({
    search,
    onSearchChange,
    type,
    onTypeChange,
    month,
    onMonthChange,
    months,
    locale,
}: MediaPickerToolbarProps) {
    const tToolbar = useTranslations("Media.toolbar");
    const tTypes = useTranslations("Media.mediaTypes");
    const tDate = useTranslations("Media.dateFilter");
    const tMonth = useTranslations("Media.monthNames");

    return (
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
                <SelectTrigger className="h-9 w-[12rem] gap-2" aria-label={tTypes("all")}>
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
                <SelectTrigger className="h-9 w-[12rem] gap-2" aria-label={tDate("all")}>
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
    );
}
