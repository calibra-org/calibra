"use client";

import { Menu } from "@base-ui/react/menu";
import type { Locale } from "@calibra/shared/i18n";
import { Check, ChevronDown, FolderTree } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Input } from "#/components/ui/input";
import { ScrollArea } from "#/components/ui/scroll-area";
import { cn } from "#/lib/utils";

import { flattenCategoryTree } from "./build-tree";
import type { AdminCategoryLike } from "./category-inspector";

interface ParentPickerProps {
    rows: AdminCategoryLike[];
    /** Category being edited — excluded from the picker along with its descendants. */
    excludeId: number | null;
    /** Set of descendant ids of `excludeId`. Pre-computed by the inspector. */
    excludeDescendants: ReadonlySet<number>;
    value: number | null;
    onChange: (value: number | null) => void;
    locale: Locale;
    disabled?: boolean;
}

/**
 * Compact tree-aware combobox used by the inspector to pick a parent category. Visually a
 * disclosure button + filterable popup; the tree inside the popup is rendered using indented
 * rows (no dashes — that's the whole point of this redesign).
 */
export function ParentPicker({ rows, excludeId, excludeDescendants, value, onChange, locale, disabled }: ParentPickerProps) {
    const t = useTranslations("Categories.inspector.parent");
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const flat = useMemo(() => {
        const adminLike = rows.map((row) => ({
            id: row.id,
            parentId: row.parentId,
            name: row.name,
            slug: row.slug,
            productCount: row.productCount ?? 0,
            imageMediaId: row.imageMediaId ?? null,
            imageUrl: row.imageUrl ?? null,
        }));
        return flattenCategoryTree(adminLike, null).filter((row) => {
            if (excludeId !== null && row.category.id === excludeId) return false;
            if (excludeDescendants.has(row.category.id)) return false;
            if (query.length === 0) return true;
            const haystack = `${row.category.name[locale] ?? ""} ${row.category.slug[locale] ?? ""}`.toLowerCase();
            return haystack.includes(query.toLowerCase());
        });
    }, [rows, excludeId, excludeDescendants, locale, query]);

    const selectedName = useMemo(() => {
        if (value === null) return t("none");
        const match = rows.find((row) => row.id === value);
        return match?.name[locale] ?? t("none");
    }, [rows, value, locale, t]);

    return (
        <Menu.Root open={open} onOpenChange={setOpen}>
            <Menu.Trigger
                disabled={disabled}
                className={cn(
                    "inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color]",
                    "hover:border-ring/40",
                    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                )}
            >
                <span className="flex min-w-0 items-center gap-2">
                    <FolderTree className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate text-start">{selectedName}</span>
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner sideOffset={6} align="start" className="z-50 w-[var(--anchor-width)]">
                    <Menu.Popup
                        className={cn(
                            "flex max-h-80 w-full min-w-72 flex-col gap-1 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none",
                            "data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                            "transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none",
                        )}
                    >
                        <div className="p-1">
                            <Input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={t("searchPlaceholder")}
                                className="h-8"
                            />
                        </div>
                        <ScrollArea viewportClassName="max-h-60">
                            <div className="flex flex-col gap-0.5 p-1">
                                <ParentOption
                                    label={t("none")}
                                    selected={value === null}
                                    depth={0}
                                    onSelect={() => {
                                        onChange(null);
                                        setOpen(false);
                                    }}
                                />
                                {flat.map((row) => (
                                    <ParentOption
                                        key={row.category.id}
                                        label={row.category.name[locale] || t("untitled")}
                                        slug={row.category.slug[locale] || undefined}
                                        depth={row.depth + 1}
                                        selected={value === row.category.id}
                                        onSelect={() => {
                                            onChange(row.category.id);
                                            setOpen(false);
                                        }}
                                    />
                                ))}
                                {flat.length === 0 && query.length > 0 && (
                                    <div className="px-2 py-3 text-center text-muted-foreground text-xs">{t("noMatches")}</div>
                                )}
                            </div>
                        </ScrollArea>
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}

interface ParentOptionProps {
    label: string;
    slug?: string;
    depth: number;
    selected: boolean;
    onSelect: () => void;
}

function ParentOption({ label, slug, depth, selected, onSelect }: ParentOptionProps) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm outline-none transition-colors",
                "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent",
                selected && "bg-accent/60 font-medium",
            )}
            style={{ paddingInlineStart: `${8 + depth * 14}px` }}
        >
            <span className="truncate">{label}</span>
            {slug !== undefined && (
                <span className="ms-auto truncate font-mono text-muted-foreground text-xs" dir="ltr">
                    /{slug}
                </span>
            )}
            {selected && <Check className="size-3.5 text-primary" aria-hidden="true" />}
        </button>
    );
}
