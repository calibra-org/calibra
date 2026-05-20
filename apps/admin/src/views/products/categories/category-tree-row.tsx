"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, FolderTree, GripVertical, ImageIcon, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { formatNumber } from "#/lib/format";
import { cn } from "#/lib/utils";

import { type CategoryTreeRow, TREE_INDENT_PX } from "./types";

interface CategoryTreeRowViewProps {
    row: CategoryTreeRow;
    locale: Locale;
    isSelected: boolean;
    isDragging: boolean;
    isDropTarget: boolean;
    projectedDepth: number | null;
    onSelect: (id: number) => void;
    onToggleExpand: (id: number) => void;
    onAddChild: (parentId: number) => void;
    onDelete: (id: number) => void;
}

/**
 * Single row in the category tree. Behaves like a button (Enter / Space activate, ←/→ toggle
 * expand, ⋯ for the row menu). Tree-rail rendering happens through `parentChain` rather than
 * dashed name prefixes — every depth gets a thin vertical guide that ends in a soft `⌐` at
 * the row's start so even five-level nestings stay readable.
 */
export function CategoryTreeRowView({
    row,
    locale,
    isSelected,
    isDragging,
    isDropTarget,
    projectedDepth,
    onSelect,
    onToggleExpand,
    onAddChild,
    onDelete,
}: CategoryTreeRowViewProps) {
    const t = useTranslations("Categories");
    const sortable = useSortable({ id: row.category.id });
    const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition } = sortable;

    const depth = projectedDepth ?? row.depth;
    const indentPx = depth * TREE_INDENT_PX;

    const style: CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition,
    };

    const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(row.category.id);
        }
        if (event.key === "ArrowRight" && row.hasChildren && !row.isExpanded) {
            event.preventDefault();
            onToggleExpand(row.category.id);
        }
        if (event.key === "ArrowLeft" && row.hasChildren && row.isExpanded) {
            event.preventDefault();
            onToggleExpand(row.category.id);
        }
    };

    const handleChevronClick = (event: MouseEvent) => {
        event.stopPropagation();
        onToggleExpand(row.category.id);
    };

    return (
        <div ref={setNodeRef} style={style} className={cn("group relative", isDragging && "z-10 opacity-60")}>
            {/**
             * Tree rails — one thin vertical line per ancestor. Drawn behind the row so the
             * gripper / chevron / thumbnail sit on top. The lines stop one row above the last
             * sibling thanks to `last-of-type:before:h-1/2` styling on the container parent.
             */}
            <TreeRails depth={row.depth} />

            <div
                role="treeitem"
                aria-level={row.depth + 1}
                aria-expanded={row.hasChildren ? row.isExpanded : undefined}
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => onSelect(row.category.id)}
                onKeyDown={handleRowKeyDown}
                className={cn(
                    "flex h-12 items-center gap-2 rounded-lg border border-transparent bg-transparent pe-2 transition-colors",
                    "hover:bg-accent/40",
                    "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
                    isSelected && "border-primary/30 bg-primary/5 shadow-xs",
                    isDropTarget && "border-primary/60 bg-primary/10 ring-2 ring-primary/30",
                )}
                style={{ paddingInlineStart: `${indentPx + 8}px` }}
            >
                <button
                    ref={setActivatorNodeRef}
                    type="button"
                    aria-label={t("dragHandle")}
                    className={cn(
                        "flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground/60 transition-opacity active:cursor-grabbing",
                        "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
                        isSelected && "opacity-100",
                    )}
                    onClick={(event) => event.stopPropagation()}
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="size-4" aria-hidden="true" />
                </button>

                <button
                    type="button"
                    onClick={handleChevronClick}
                    aria-label={row.isExpanded ? t("collapse") : t("expand")}
                    className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-transform",
                        "hover:bg-muted/70 hover:text-foreground",
                        row.hasChildren ? "opacity-100" : "pointer-events-none opacity-0",
                        row.isExpanded && "rotate-90 rtl:-rotate-90",
                    )}
                >
                    <ChevronRight className="size-3.5 rtl:scale-x-[-1]" aria-hidden="true" />
                </button>

                <CategoryThumb url={row.category.imageUrl} alt={row.category.name[locale] ?? ""} />

                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate font-medium text-foreground text-sm">
                        {row.category.name[locale] || t("untitled")}
                    </span>
                    <span className="hidden truncate font-mono text-muted-foreground text-xs sm:inline" dir="ltr">
                        /{row.category.slug[locale] || "—"}
                    </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    {row.hasChildren && (
                        <Badge variant="outline" className="gap-1 border-border/60 px-2 font-normal text-muted-foreground">
                            <FolderTree className="size-3" aria-hidden="true" />
                            <span className="tabular-nums">{formatNumber(row.descendantCount, locale)}</span>
                        </Badge>
                    )}
                    <Badge
                        variant="secondary"
                        className={cn(
                            "min-w-9 justify-center bg-secondary/60 font-normal text-foreground/80 tabular-nums",
                            row.category.productCount === 0 && "bg-secondary/30 text-muted-foreground",
                        )}
                    >
                        {formatNumber(row.category.productCount, locale)}
                    </Badge>

                    <div
                        className={cn(
                            "flex items-center gap-0.5 opacity-0 transition-opacity",
                            "group-focus-within:opacity-100 group-hover:opacity-100",
                            isSelected && "opacity-100",
                        )}
                    >
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t("addChild")}
                            onClick={(event) => {
                                event.stopPropagation();
                                onAddChild(row.category.id);
                            }}
                            className="size-7 text-muted-foreground hover:text-foreground"
                        >
                            <Plus className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t("delete")}
                            onClick={(event) => {
                                event.stopPropagation();
                                onDelete(row.category.id);
                            }}
                            className="size-7 text-muted-foreground hover:text-destructive"
                        >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface TreeRailsProps {
    depth: number;
}

/**
 * Renders `depth` thin vertical guide lines, one per ancestor level. Positioned absolutely
 * inside the row container — they don't take part in the row's flex layout, so changes to row
 * height / padding leave them untouched. The last rail terminates with a short horizontal
 * stub so the eye can connect a parent to its first-child row without dashes in the name.
 */
function TreeRails({ depth }: TreeRailsProps) {
    if (depth === 0) return null;
    const rails: number[] = [];
    for (let i = 0; i < depth; i += 1) rails.push(i);
    return (
        <div className="pointer-events-none absolute inset-y-0 start-0 select-none" aria-hidden="true">
            {rails.map((i) => (
                <span
                    key={i}
                    className="absolute top-0 h-full w-px bg-border/70"
                    style={{ insetInlineStart: `${i * TREE_INDENT_PX + 18}px` }}
                />
            ))}
            <span
                className="absolute top-1/2 h-px w-2.5 bg-border/70"
                style={{ insetInlineStart: `${(depth - 1) * TREE_INDENT_PX + 18}px` }}
            />
        </div>
    );
}

interface CategoryThumbProps {
    url: string | null;
    alt: string;
}

function CategoryThumb({ url, alt }: CategoryThumbProps) {
    if (url === null || url.length === 0) {
        return (
            <div
                className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground/60"
                aria-hidden="true"
            >
                <ImageIcon className="size-3.5" />
            </div>
        );
    }
    return (
        // biome-ignore lint/performance/noImgElement: mock CDN, no Next/Image loader for now
        <img src={url} alt={alt} loading="lazy" className="size-8 shrink-0 rounded-md border border-border/40 object-cover" />
    );
}
