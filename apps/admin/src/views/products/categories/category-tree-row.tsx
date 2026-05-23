"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, FolderTree, GripVertical, ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { formatNumber } from "#/lib/format";
import { cn } from "#/lib/utils";

import { type CategoryTreeRow, TREE_INDENT_PX } from "./types";

interface CategoryTreeRowViewProps {
    row: CategoryTreeRow;
    locale: Locale;
    isSelected: boolean;
    /** This row is currently checked for bulk-action selection. Independent of `isSelected`. */
    isChecked: boolean;
    /** This row is the one currently being dragged — render it dimmed in place. */
    isActive: boolean;
    /** First row in the visible list — skips the top divider. */
    isFirst: boolean;
    /** Override the row's indent while dragging — reflects the projected post-drop depth. */
    overrideDepth: number | null;
    onSelect: (id: number) => void;
    onToggleExpand: (id: number) => void;
    onAddChild: (parentId: number) => void;
    onEdit: (id: number) => void;
    onDelete: (id: number) => void;
    onToggleChecked: (id: number) => void;
}

/**
 * One row in the category tree. The whole row is the drag activator (with an 8px distance
 * constraint so clicks still navigate) — the grip handle is purely a visual cue and stays
 * visible at low opacity so the affordance is discoverable without hovering. The chevron and
 * action buttons stop pointer propagation so their tap targets stay clickable.
 *
 * Visual feedback during drag:
 *
 *   - Active row: dimmed + scaled, its indent animates toward the projected depth.
 *   - Drop-parent row: primary-tinted halo + ring so the user knows where the row will land.
 *   - Other rows: dnd-kit's transition shifts them out of the way automatically.
 */
export function CategoryTreeRowView({
    row,
    locale,
    isSelected,
    isChecked,
    isActive,
    isFirst,
    overrideDepth,
    onSelect,
    onToggleExpand,
    onAddChild,
    onEdit,
    onDelete,
    onToggleChecked,
}: CategoryTreeRowViewProps) {
    const t = useTranslations("Categories");
    const sortable = useSortable({ id: row.category.id });
    const { setNodeRef, attributes, listeners, transform, transition } = sortable;

    const depth = overrideDepth ?? row.depth;
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

    /**
     * Action buttons live inside the row; without this they'd fight the row's drag listener and
     * the user would either start a drag instead of clicking, or never click at all.
     */
    const stopPointer = (event: PointerEvent) => {
        event.stopPropagation();
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "group relative touch-none transition-transform",
                /**
                 * Active row stays in the list (dimmed) so siblings can animate around it,
                 * but it carries no other treatment — the DragOverlay ghost is the visual
                 * focus, and the drop-parent / insertion-line indicators show where the row
                 * will land. Layering a primary outline on the active row competed with the
                 * drop-parent halo and made it hard to tell which row was the target.
                 */
                isActive && "pointer-events-none opacity-40",
            )}
            {...attributes}
            {...listeners}
        >
            <TreeRails depth={row.depth} />

            {/**
             * Always-visible divider in the gap above this row (skipped on the first row).
             * Faint structural separator — operators read the list as a stack of cards even
             * at rest. Logical inset-inline so the line spans the writing direction cleanly.
             */}
            {!isFirst && (
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute start-3 end-3 h-px bg-border/60"
                    style={{ top: "-1px" }}
                />
            )}

            <div
                role="treeitem"
                aria-level={row.depth + 1}
                aria-expanded={row.hasChildren ? row.isExpanded : undefined}
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => onSelect(row.category.id)}
                onKeyDown={handleRowKeyDown}
                className={cn(
                    /**
                     * Base border stays at 2 px (transparent) so toggling the active /
                     * drop-parent states doesn't shift the row down by 1 px when borders
                     * thicken — every state below picks the same border width.
                     */
                    "flex h-12 items-center gap-2 rounded-lg border-2 border-transparent bg-transparent pe-2 transition-[padding,background,border,box-shadow] duration-150",
                    "hover:bg-accent/40",
                    "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
                    isSelected && !isActive && "border-primary/30 bg-primary/5 shadow-xs",
                    isChecked && !isActive && "bg-primary/10",
                    /**
                     * No row-level treatment for the drop target. The DragOverlay ghost +
                     * caption + the dimmed in-list active row (which animates to the
                     * projected indent via {@link overrideDepth}) carry the entire signal of
                     * "where will this land".
                     */
                )}
                style={{ paddingInlineStart: `${indentPx + 8}px` }}
            >
                <Checkbox
                    aria-label={t("selectRow", { name: row.category.name[locale] || t("untitled") })}
                    checked={isChecked}
                    onCheckedChange={() => onToggleChecked(row.category.id)}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={stopPointer}
                    className="ms-0.5 shrink-0"
                />

                <span
                    aria-hidden="true"
                    className={cn(
                        "flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground/50 transition-opacity",
                        "group-focus-within:text-muted-foreground group-hover:text-muted-foreground",
                        isActive && "cursor-grabbing text-muted-foreground",
                    )}
                >
                    <GripVertical className="size-4" aria-hidden="true" />
                </span>

                <button
                    type="button"
                    onClick={handleChevronClick}
                    onPointerDown={stopPointer}
                    aria-label={row.isExpanded ? t("collapse") : t("expand")}
                    className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
                        "hover:bg-muted/70 hover:text-foreground",
                        row.hasChildren ? "opacity-100" : "pointer-events-none opacity-0",
                    )}
                >
                    {/**
                     * Two icons rather than rotating one — under RTL the `data-rtl-flip` scale
                     * composes with a rotation in the wrong order (CSS spec applies scale
                     * before rotate on individual transform properties), producing an
                     * upward-pointing chevron when expanded. Picking the right icon per state
                     * sidesteps the math entirely: `ChevronDown` is vertically symmetric so it
                     * doesn't need a flip; `ChevronRight` does.
                     */}
                    {row.isExpanded ? (
                        <ChevronDown className="size-3.5" aria-hidden="true" />
                    ) : (
                        <ChevronRight className="size-3.5" data-rtl-flip aria-hidden="true" />
                    )}
                </button>

                <CategoryThumb url={row.category.imageUrl} alt={row.category.name[locale] ?? ""} />

                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate font-medium text-foreground text-sm">
                        {row.category.name[locale] || t("untitled")}
                    </span>
                    <span className="hidden truncate font-mono text-muted-foreground text-xs sm:inline" dir="ltr">
                        /{row.category.slug[locale] || "—"}
                    </span>
                    {/**
                     * The inline "↳ parent" badge previously lived here; it doubled the
                     * caption already attached to the DragOverlay ghost and cluttered the
                     * dimmed active row. The ghost carries the parent name now.
                     */}
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
                            isActive && "opacity-0",
                        )}
                    >
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t("editAria", { name: row.category.name[locale] || t("untitled") })}
                            onPointerDown={stopPointer}
                            onClick={(event) => {
                                event.stopPropagation();
                                onEdit(row.category.id);
                            }}
                            className="size-7 text-muted-foreground hover:text-foreground"
                        >
                            <Pencil className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t("addChildAria", { name: row.category.name[locale] || t("untitled") })}
                            onPointerDown={stopPointer}
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
                            aria-label={t("deleteAria", { name: row.category.name[locale] || t("untitled") })}
                            onPointerDown={stopPointer}
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
 * Renders one thin vertical guide line per ancestor. Drawn behind the row so the grip /
 * chevron / thumbnail stay on top, and positioned with `insetInlineStart` so the rails flip
 * naturally under RTL.
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
        // biome-ignore lint/performance/noImgElement: mock CDN, no Next/Image loader configured
        <img src={url} alt={alt} loading="lazy" className="size-8 shrink-0 rounded-md border border-border/40 object-cover" />
    );
}
