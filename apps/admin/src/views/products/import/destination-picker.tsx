"use client";

import { IMPORT_FIELDS, type ImportField } from "@calibra/shared/import-fields";
import { Check, ChevronsUpDown, Search, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Input } from "#/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { cn } from "#/lib/utils";

export interface DestinationPickerProps {
    value: string | null;
    onChange: (next: string | null) => void;
    /** Searched-and-focused on `/` keypress when this row is the active row. */
    autoFocus?: boolean;
    disabled?: boolean;
}

/**
 * Searchable destination dropdown for the mapping table. Lists every field from
 * `@calibra/shared/import-fields`, grouped by section (basic, pricing, stock, …). The first
 * option is always "Don't import" (= `null`), and the type chip next to each option helps the
 * operator pick the right field without needing to remember slugs.
 */
export function DestinationPicker({ value, onChange, autoFocus, disabled }: DestinationPickerProps): React.JSX.Element {
    const t = useTranslations("ProductsImport.mapping");
    const tField = useTranslations("ProductsImport.fields");
    const tGroup = useTranslations("ProductsImport.groups");

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open && inputRef.current !== null) {
            requestAnimationFrame(() => inputRef.current?.focus());
        }
        if (!open) setQuery("");
    }, [open]);

    useEffect(() => {
        if (autoFocus === true) setOpen(true);
    }, [autoFocus]);

    const grouped = useMemo(() => {
        const filtered = IMPORT_FIELDS.filter((field) => {
            if (query === "") return true;
            const lower = query.toLowerCase();
            if (field.key.toLowerCase().includes(lower)) return true;
            if (field.aliases.some((alias) => alias.toLowerCase().includes(lower))) return true;
            return safeTranslateField(tField, `${field.key}.label`, field.key).toLowerCase().includes(lower);
        });
        const buckets = new Map<string, ImportField[]>();
        for (const field of filtered) {
            const arr = buckets.get(field.group) ?? [];
            arr.push(field);
            buckets.set(field.group, arr);
        }
        return Array.from(buckets.entries());
    }, [query, tField]);

    const selected = useMemo(() => {
        if (value === null) return null;
        return IMPORT_FIELDS.find((f) => f.key === value) ?? null;
    }, [value]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                className={cn(
                    "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors",
                    "hover:border-ring/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    disabled && "cursor-not-allowed opacity-50",
                )}
                disabled={disabled}
            >
                {selected !== null ? (
                    <span className="flex items-center gap-2 truncate">
                        <span className="truncate">{safeTranslateField(tField, `${selected.key}.label`, selected.key)}</span>
                        <Badge variant="outline" className="font-normal text-[10px]">
                            {selected.type}
                        </Badge>
                    </span>
                ) : (
                    <span className="text-muted-foreground">{t("dontImport")}</span>
                )}
                <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0">
                <div className="relative border-b">
                    <Search className="absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("searchField")}
                        className="h-9 border-0 ps-7 pe-2 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                </div>
                <ul className="max-h-64 overflow-y-auto p-1">
                    <li>
                        <button
                            type="button"
                            onClick={() => {
                                onChange(null);
                                setOpen(false);
                            }}
                            className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        >
                            <span className="flex items-center gap-2 text-muted-foreground">
                                <XCircle className="size-4" aria-hidden />
                                {t("dontImport")}
                            </span>
                            {value === null ? <Check className="size-4 text-primary" aria-hidden /> : null}
                        </button>
                    </li>
                    {grouped.map(([group, fields]) => (
                        <li key={group}>
                            <div className="px-2 pt-2 pb-1 font-semibold text-muted-foreground text-xs uppercase">
                                {tGroup(group)}
                            </div>
                            {fields.map((field) => (
                                <button
                                    type="button"
                                    key={field.key}
                                    onClick={() => {
                                        onChange(field.key);
                                        setOpen(false);
                                    }}
                                    className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                                >
                                    <span className="flex items-center gap-2 truncate">
                                        <span className="truncate">
                                            {safeTranslateField(tField, `${field.key}.label`, field.key)}
                                        </span>
                                        <Badge variant="outline" className="font-normal text-[10px]">
                                            {field.type}
                                        </Badge>
                                    </span>
                                    {value === field.key ? <Check className="size-4 text-primary" aria-hidden /> : null}
                                </button>
                            ))}
                        </li>
                    ))}
                    {grouped.length === 0 ? (
                        <li className="px-3 py-4 text-center text-muted-foreground text-sm">{t("noResults")}</li>
                    ) : null}
                </ul>
            </PopoverContent>
        </Popover>
    );
}

/**
 * `useTranslations` throws when a key is missing — but the importer's field labels need to be
 * forgiving so a missing translation doesn't break the picker. Fall back to the field's stable
 * key on miss.
 */
function safeTranslateField(t: ReturnType<typeof useTranslations>, key: string, fallback: string): string {
    try {
        const value = t(key);
        if (typeof value === "string" && value.length > 0 && value !== key) return value;
        return fallback;
    } catch {
        return fallback;
    }
}
