"use client";

import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    DragOverlay,
    type DragStartEvent,
    defaultDropAnimationSideEffects,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, GripVertical } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "#/lib/utils";

import { SectionCard } from "./section-card";

export interface SectionSpec {
    /** Stable id used for both DnD identity and persistence keys. */
    id: string;
    title: ReactNode;
    body: ReactNode;
    /** Optional chip rendered next to the title (e.g. "خطا" / "ذخیره‌نشده"). */
    badge?: ReactNode;
    /** Optional right-side header slot for per-section actions. */
    actions?: ReactNode;
    /** Defaults to `true` — when false, the chevron toggle is hidden and the body always renders. */
    isCollapsible?: boolean;
    /** Defaults to `true` — when false, the grip handle is hidden and the section keeps its slot. */
    isDraggable?: boolean;
    /** Initial collapsed state on first paint. Falsy by default. */
    defaultCollapsed?: boolean;
}

export interface DraggableSectionGridProps {
    /** Storage namespace for the order + collapsed state keys. Must be unique per page section. */
    storageKey: string;
    sections: SectionSpec[];
    /** Labels for a11y. The grid is reading-direction agnostic, but the labels still need to translate. */
    labels: {
        grabHandle: string;
        collapse: string;
        expand: string;
    };
    /** Optional callback fired whenever the persisted order changes (e.g. for analytics or user-prefs sync). */
    onOrderChange?: (next: string[]) => void;
}

interface OrderedState {
    order: string[];
    collapsed: Record<string, boolean>;
}

/**
 * Generic vertical-stacked sortable section grid. Each section renders as a {@link SectionCard}
 * with its own grip handle (drag) and chevron (collapse). Order + collapsed state persist in
 * `localStorage` keyed by `storageKey` so two grids on the same page (main + sidebar) stay
 * isolated. The grid is keyboard-accessible via {@link KeyboardSensor}: focus a grip, press
 * Space to grab, ↑/↓ to move, Space again to drop, Esc to cancel.
 *
 * Phase 2 constraint: single-column only — cross-column drag is intentionally out of scope to
 * avoid the layout primitives that move-across-columns would require.
 */
export function DraggableSectionGrid({ storageKey, sections, labels, onOrderChange }: DraggableSectionGridProps) {
    const defaultOrder = useMemo(() => sections.map((s) => s.id), [sections]);
    const defaultCollapsed = useMemo(() => {
        const initial: Record<string, boolean> = {};
        for (const section of sections) {
            if (section.defaultCollapsed === true) initial[section.id] = true;
        }
        return initial;
    }, [sections]);

    const orderKey = `${storageKey}.order`;
    const collapsedKey = `${storageKey}.collapsed`;

    const [state, setState] = useState<OrderedState>({ order: defaultOrder, collapsed: defaultCollapsed });
    const hydrated = useRef(false);
    const announcement = useRef<string>("");

    /** Hydrate from localStorage once on the client; SSR gets the default order so the first paint is stable. */
    useEffect(() => {
        if (typeof window === "undefined" || hydrated.current) return;
        hydrated.current = true;
        try {
            const persistedOrderRaw = window.localStorage.getItem(orderKey);
            const persistedCollapsedRaw = window.localStorage.getItem(collapsedKey);
            const persistedOrder = persistedOrderRaw === null ? null : (JSON.parse(persistedOrderRaw) as string[]);
            const persistedCollapsed =
                persistedCollapsedRaw === null
                    ? defaultCollapsed
                    : (JSON.parse(persistedCollapsedRaw) as Record<string, boolean>);
            const reconciled = reconcileOrder(defaultOrder, persistedOrder);
            setState({ order: reconciled, collapsed: { ...defaultCollapsed, ...persistedCollapsed } });
        } catch {
            /** Bad JSON or quota issue — fall back to defaults. */
        }
    }, [orderKey, collapsedKey, defaultOrder, defaultCollapsed]);

    /** Reconcile when `sections` changes (new section added in a future deploy, etc.). */
    useEffect(() => {
        setState((current) => {
            const reconciled = reconcileOrder(defaultOrder, current.order);
            if (reconciled.join(",") === current.order.join(",")) return current;
            return { ...current, order: reconciled };
        });
    }, [defaultOrder]);

    const persistOrder = useCallback(
        (next: string[]) => {
            if (typeof window === "undefined") return;
            try {
                window.localStorage.setItem(orderKey, JSON.stringify(next));
            } catch {
                /** quota or safari private mode — silently skip. */
            }
            onOrderChange?.(next);
        },
        [orderKey, onOrderChange],
    );

    const persistCollapsed = useCallback(
        (next: Record<string, boolean>) => {
            if (typeof window === "undefined") return;
            try {
                window.localStorage.setItem(collapsedKey, JSON.stringify(next));
            } catch {
                /** ignored. */
            }
        },
        [collapsedKey],
    );

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const sectionById = useMemo(() => {
        const map = new Map<string, SectionSpec>();
        for (const section of sections) map.set(section.id, section);
        return map;
    }, [sections]);

    const orderedSections = useMemo(
        () => state.order.map((id) => sectionById.get(id)).filter((s): s is SectionSpec => s !== undefined),
        [state.order, sectionById],
    );

    /**
     * `activeId` drives the `DragOverlay`: while a drag is in flight, the dragged section is
     * rendered there at the source's pre-drag size and the original position becomes a faded
     * placeholder. This avoids the visual blowup that happens when the in-place sortable item
     * fights variable-height flex siblings.
     */
    const [activeId, setActiveId] = useState<string | null>(null);
    const activeSection = activeId === null ? undefined : sectionById.get(activeId);

    const onDragStart = useCallback((event: DragStartEvent) => {
        setActiveId(String(event.active.id));
    }, []);

    const onDragEnd = useCallback(
        (event: DragEndEvent) => {
            setActiveId(null);
            const { active, over } = event;
            if (over === null || active.id === over.id) return;
            const oldIndex = state.order.indexOf(String(active.id));
            const newIndex = state.order.indexOf(String(over.id));
            if (oldIndex === -1 || newIndex === -1) return;
            const next = arrayMove(state.order, oldIndex, newIndex);
            setState((current) => ({ ...current, order: next }));
            persistOrder(next);
            const movedSection = sectionById.get(String(active.id));
            announcement.current = `${textOf(movedSection?.title)} — ${newIndex + 1} / ${next.length}`;
        },
        [state.order, persistOrder, sectionById],
    );

    const onDragCancel = useCallback(() => setActiveId(null), []);

    const toggleCollapse = useCallback(
        (id: string, open: boolean) => {
            setState((current) => {
                const next = { ...current.collapsed, [id]: !open };
                persistCollapsed(next);
                announcement.current = `${textOf(sectionById.get(id)?.title)} — ${open ? labels.expand : labels.collapse}`;
                return { ...current, collapsed: next };
            });
        },
        [persistCollapsed, sectionById, labels],
    );

    return (
        <div className="flex flex-col gap-2.5">
            <DndContext
                id={storageKey}
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragCancel={onDragCancel}
            >
                <SortableContext items={state.order} strategy={verticalListSortingStrategy}>
                    {orderedSections.map((section) => {
                        const isCollapsedFlag = state.collapsed[section.id] === true;
                        const isOpen = !(section.isCollapsible === false ? false : isCollapsedFlag);
                        const isActive = activeId === section.id;
                        return (
                            <SectionCard
                                key={section.id}
                                sectionId={section.id}
                                title={section.title}
                                badge={section.badge}
                                actions={section.actions}
                                isCollapsible={section.isCollapsible}
                                isDraggable={section.isDraggable}
                                isOpen={section.isCollapsible === false ? true : isOpen}
                                onOpenChange={(open) => toggleCollapse(section.id, open)}
                                collapseLabel={labels.collapse}
                                expandLabel={labels.expand}
                                grabLabel={labels.grabHandle}
                                isSourcePlaceholder={isActive}
                            >
                                {section.body}
                            </SectionCard>
                        );
                    })}
                </SortableContext>
                <DragOverlay
                    dropAnimation={{
                        sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }),
                    }}
                >
                    {activeSection ? <SectionDragPreview title={activeSection.title} /> : null}
                </DragOverlay>
            </DndContext>
            <span className="sr-only" role="status" aria-live="polite">
                {announcement.current}
            </span>
        </div>
    );
}

/**
 * The visual rendered inside the {@link DragOverlay} while a section is being moved. We
 * intentionally show only the section's header row (grip + title + chevron) — never the body —
 * so the overlay's height stays bounded regardless of how much content the dragged section
 * normally carries. Without this, a tall section would balloon under the cursor and visually
 * overflow the entire page.
 */
function SectionDragPreview({ title }: { title: ReactNode }) {
    return (
        <div
            className={cn(
                "flex h-10 items-center gap-2 rounded-lg border border-primary/60 bg-card px-2.5 text-card-foreground shadow-lg",
                "ring-2 ring-primary/30",
            )}
        >
            <span className="grid size-7 shrink-0 cursor-grabbing place-items-center rounded-md text-foreground">
                <GripVertical className="size-4" aria-hidden="true" />
            </span>
            <h3 className="truncate font-semibold text-foreground text-sm">{title}</h3>
            <span className="ms-auto inline-flex size-7 items-center justify-center text-muted-foreground">
                <ChevronDown className="size-4" aria-hidden="true" />
            </span>
        </div>
    );
}

/**
 * Resets the persisted order + collapsed state for the given storage key, so the next render
 * falls back to the spec's defaults. Used by the "Reset to default order" affordance.
 */
export function resetSectionGridStorage(storageKey: string): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(`${storageKey}.order`);
        window.localStorage.removeItem(`${storageKey}.collapsed`);
    } catch {
        /** ignored. */
    }
}

/**
 * Drop ids that no longer exist in the spec; append newly-introduced sections at the tail. Returns
 * the reconciled order, preserving the user's pinned positions for known ids.
 */
function reconcileOrder(defaultOrder: string[], persisted: string[] | null | undefined): string[] {
    if (persisted === null || persisted === undefined || persisted.length === 0) return defaultOrder;
    const known = new Set(defaultOrder);
    const ordered = persisted.filter((id) => known.has(id));
    const seen = new Set(ordered);
    const appended = defaultOrder.filter((id) => !seen.has(id));
    return [...ordered, ...appended];
}

/** Coerce a ReactNode title into a string for aria-live announcements. Best effort — uses the simple text path. */
function textOf(node: ReactNode | undefined): string {
    if (node === undefined || node === null) return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    return "section";
}
