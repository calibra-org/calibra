"use client";

import { Check, ChevronsUpDown, Loader2, Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { type ComboboxOption, MultiCombobox } from "#/components/ui/combobox";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { ScrollArea } from "#/components/ui/scroll-area";
import { cn } from "#/lib/utils";

export interface ResourcePickerSingleProps {
    multiple?: false;
    value: number | null;
    onChange: (next: number | null) => void;
    search: (query: string) => Promise<ComboboxOption[]>;
    onResolve?: (ids: (number | string)[]) => Promise<ComboboxOption[]>;
    placeholder?: string;
    emptyHint?: string;
    creatable?: { onCreate: (name: string) => Promise<ComboboxOption> };
    disabled?: boolean;
    /** Read-only display fallback when the value is set but `onResolve` hasn't filled the chip yet. */
    fallbackLabel?: string;
    className?: string;
}

export interface ResourcePickerMultiProps {
    multiple: true;
    value: number[];
    onChange: (next: number[]) => void;
    search: (query: string) => Promise<ComboboxOption[]>;
    onResolve?: (ids: (number | string)[]) => Promise<ComboboxOption[]>;
    placeholder?: string;
    emptyHint?: string;
    creatable?: { onCreate: (name: string) => Promise<ComboboxOption> };
    disabled?: boolean;
    className?: string;
}

export type ResourcePickerProps = ResourcePickerSingleProps | ResourcePickerMultiProps;

/**
 * The high-quality "pick one or more entities" primitive used across the admin for categories,
 * brands, tags, products, attributes, and attribute terms. For `multiple: true`, wraps the
 * existing `<MultiCombobox />` and exposes the same async search contract. For `multiple: false`,
 * renders a popover with a search input + single-select list and a clear button beside the chip.
 *
 * The `creatable` slot turns the picker into an inline-create surface: when the query has no
 * exact match, a "Create '<query>'" pill appears at the bottom of the dropdown that fires
 * `onCreate` then adopts the returned option as the new selection.
 */
export function ResourcePicker(props: ResourcePickerProps) {
    if (props.multiple === true) {
        return <MultiResourcePicker {...props} />;
    }
    return <SingleResourcePicker {...props} />;
}

function MultiResourcePicker({
    value,
    onChange,
    search,
    onResolve,
    placeholder,
    emptyHint,
    creatable,
    disabled,
    className,
}: ResourcePickerMultiProps) {
    const t = useTranslations("Common");
    const [pending, setPending] = useState(false);
    const wrappedSearch = useCallback(
        async (q: string): Promise<ComboboxOption[]> => {
            const base = await search(q);
            if (creatable === undefined || q.trim().length === 0) return base;
            const exact = base.find((opt) => opt.label.trim().toLowerCase() === q.trim().toLowerCase());
            if (exact !== undefined) return base;
            return [...base, { id: `__create__${q}`, label: t("create", { name: q }) }];
        },
        [search, creatable, t],
    );

    const handleSelectionChange = async (next: (number | string)[]) => {
        const createMarker = next.find((id) => typeof id === "string" && id.startsWith("__create__"));
        if (createMarker !== undefined && creatable !== undefined) {
            const name = String(createMarker).replace(/^__create__/, "");
            setPending(true);
            try {
                const created = await creatable.onCreate(name);
                const cleaned = next.filter((id) => id !== createMarker);
                onChange([...cleaned.filter((id): id is number => typeof id === "number"), Number(created.id)]);
            } finally {
                setPending(false);
            }
            return;
        }
        onChange(next.filter((id): id is number => typeof id === "number"));
    };

    return (
        <div className={cn("flex flex-col gap-2", className)}>
            <MultiCombobox
                selectedIds={value}
                onSelectionChange={handleSelectionChange}
                onSearch={wrappedSearch}
                onResolve={onResolve}
                disabled={disabled || pending}
                labels={{
                    placeholder: placeholder ?? t("select"),
                    search: t("search"),
                    empty: emptyHint ?? t("noResults"),
                    remove: t("remove"),
                    clearAll: t("clearAll"),
                }}
            />
        </div>
    );
}

function SingleResourcePicker({
    value,
    onChange,
    search,
    onResolve,
    placeholder,
    emptyHint,
    creatable,
    disabled,
    fallbackLabel,
    className,
}: ResourcePickerSingleProps) {
    const t = useTranslations("Common");
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [options, setOptions] = useState<ComboboxOption[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [resolved, setResolved] = useState<Map<number | string, ComboboxOption>>(new Map());
    const lastRequest = useRef(0);
    const id = useId();

    useEffect(() => {
        if (onResolve === undefined || value === null || resolved.has(value)) return;
        let cancelled = false;
        onResolve([value]).then((opts) => {
            if (cancelled) return;
            setResolved((prev) => {
                const next = new Map(prev);
                for (const opt of opts) next.set(opt.id, opt);
                return next;
            });
        });
        return () => {
            cancelled = true;
        };
    }, [onResolve, value, resolved]);

    useEffect(() => {
        if (!open) return;
        const handle = setTimeout(async () => {
            const requestId = ++lastRequest.current;
            setIsSearching(true);
            try {
                const next = await search(query);
                if (requestId !== lastRequest.current) return;
                setOptions(next);
                setResolved((prev) => {
                    const map = new Map(prev);
                    for (const opt of next) map.set(opt.id, opt);
                    return map;
                });
            } finally {
                if (requestId === lastRequest.current) setIsSearching(false);
            }
        }, 200);
        return () => clearTimeout(handle);
    }, [open, query, search]);

    const select = async (option: ComboboxOption) => {
        onChange(typeof option.id === "number" ? option.id : Number(option.id));
        setResolved((prev) => new Map(prev).set(option.id, option));
        setOpen(false);
    };

    const create = async () => {
        if (creatable === undefined || query.trim().length === 0) return;
        const created = await creatable.onCreate(query.trim());
        await select(created);
        setQuery("");
    };

    const chipOption = useMemo(() => {
        if (value === null) return null;
        return resolved.get(value) ?? { id: value, label: fallbackLabel ?? `#${value}` };
    }, [value, resolved, fallbackLabel]);

    const exactMatch = options.find((opt) => opt.label.trim().toLowerCase() === query.trim().toLowerCase());
    const canCreate = creatable !== undefined && query.trim().length > 0 && exactMatch === undefined;

    return (
        <div className={cn("flex flex-col gap-2", className)}>
            {chipOption !== null && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="gap-1 ps-2 pe-1">
                        <span className="max-w-[14rem] truncate">{chipOption.label}</span>
                        {!disabled && (
                            <button
                                type="button"
                                aria-label={t("remove")}
                                onClick={() => onChange(null)}
                                className="ms-1 grid size-4 place-items-center rounded hover:bg-foreground/10"
                            >
                                <X className="size-3" aria-hidden="true" />
                            </button>
                        )}
                    </Badge>
                </div>
            )}
            {!disabled && (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger
                        render={(props) => (
                            <Button
                                {...props}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-fit justify-start gap-2 text-muted-foreground"
                                aria-controls={`${id}-list`}
                            >
                                <Search className="size-3.5" aria-hidden="true" />
                                <span>{placeholder ?? t("select")}</span>
                                <ChevronsUpDown className="ms-auto size-3.5 opacity-60" aria-hidden="true" />
                            </Button>
                        )}
                    />
                    <PopoverContent
                        side="bottom"
                        align="start"
                        className="w-[min(20rem,calc(100vw-2rem))] overflow-hidden p-0"
                    >
                        <div className="flex items-center gap-2 border-border border-b px-3 py-2">
                            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={t("search")}
                                className="h-7 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                                /** biome-ignore lint/a11y/noAutofocus: popover field. */
                                autoFocus
                            />
                            {isSearching && (
                                <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                            )}
                        </div>
                        <ScrollArea className="max-h-[min(15rem,60vh)]">
                            <ul id={`${id}-list`} className="flex flex-col py-1">
                                {options.length === 0 && !isSearching && !canCreate && (
                                    <li className="px-3 py-4 text-center text-muted-foreground text-sm">
                                        {emptyHint ?? t("noResults")}
                                    </li>
                                )}
                                {options.map((opt) => {
                                    const isSelected = value === opt.id;
                                    return (
                                        <li key={String(opt.id)}>
                                            <button
                                                type="button"
                                                onClick={() => void select(opt)}
                                                className={cn(
                                                    "flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm outline-none",
                                                    "hover:bg-accent hover:text-accent-foreground",
                                                    isSelected && "bg-accent/40",
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        "grid size-4 shrink-0 place-items-center rounded border border-border",
                                                        isSelected && "border-primary bg-primary text-primary-foreground",
                                                    )}
                                                    aria-hidden="true"
                                                >
                                                    {isSelected && <Check className="size-3" aria-hidden="true" />}
                                                </span>
                                                {opt.imageUrl !== null && opt.imageUrl !== undefined && (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={opt.imageUrl}
                                                        alt=""
                                                        className="size-8 shrink-0 rounded border border-border bg-muted object-cover"
                                                        loading="lazy"
                                                    />
                                                )}
                                                <span className="flex min-w-0 flex-col">
                                                    <span className="truncate">{opt.label}</span>
                                                    {opt.sublabel !== undefined && (
                                                        <span className="truncate text-muted-foreground text-xs">
                                                            {opt.sublabel}
                                                        </span>
                                                    )}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                                {canCreate && (
                                    <li>
                                        <button
                                            type="button"
                                            onClick={() => void create()}
                                            className="flex w-full items-center gap-2 border-border border-t px-3 py-1.5 text-start text-primary text-sm hover:bg-accent"
                                        >
                                            <Plus className="size-3.5" aria-hidden="true" />
                                            {t("create", { name: query.trim() })}
                                        </button>
                                    </li>
                                )}
                            </ul>
                        </ScrollArea>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}
