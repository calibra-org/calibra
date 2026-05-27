"use client";

import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ImageIcon, ImagePlus, Star, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type CSSProperties, useState } from "react";
import { useFormContext } from "react-hook-form";

import { MediaPicker } from "#/components/media-picker";
import type { AdminMedia } from "#/lib/types";
import { cn } from "#/lib/utils";

import type { ProductDetailFormValues } from "../schema";

import { useMediaUrlMap } from "./media-url-map";

/**
 * Sidebar Gallery card. Operates on `imageMediaIds[1..]` — the featured image at index 0 is
 * managed by the {@link FeaturedImageBody} sibling card. Drag-reorder updates the array (and
 * therefore the storefront's display order) via {@link arrayMove}. Hover affordances let the
 * operator promote any thumb to featured (swap with index 0) or drop it from the gallery in
 * one click; both mutate the form value with `shouldDirty: true` so the Save button lights up.
 *
 * Keyboard accessible — `@dnd-kit`'s `KeyboardSensor` is wired so Space grabs and Arrow keys
 * move. The remove + set-as-featured buttons are tab-reachable; the hover-only opacity flips
 * to fully visible on `:focus-within`.
 */
export function GalleryBody() {
    const t = useTranslations("Products.detail.gallery");
    const { watch, setValue } = useFormContext<ProductDetailFormValues>();
    const { getUrl, setMany } = useMediaUrlMap();
    const [pickerOpen, setPickerOpen] = useState(false);

    const ids = watch("imageMediaIds");
    /**
     * Defensive filter: the schema's `sanitizeIds` already drops NaN at the form boundary, but
     * the picker can hand back ids that are temporarily missing from the URL map; never let a
     * `NaN` leak into a React `key` (it produces duplicate-key warnings on first paint).
     */
    const galleryIds = ids.slice(1).filter((id) => Number.isFinite(id));

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over === null || active.id === over.id) return;
        const oldIndex = galleryIds.indexOf(Number(active.id));
        const newIndex = galleryIds.indexOf(Number(over.id));
        if (oldIndex === -1 || newIndex === -1) return;
        const next = arrayMove(galleryIds, oldIndex, newIndex);
        setValue(
            "imageMediaIds",
            [ids[0], ...next].filter((value): value is number => typeof value === "number"),
            {
                shouldDirty: true,
            },
        );
    };

    const handleRemove = (id: number) => {
        setValue(
            "imageMediaIds",
            ids.filter((value) => value !== id),
            { shouldDirty: true },
        );
    };

    const handlePromote = (id: number) => {
        const featured = ids[0];
        const rest = ids.slice(1).filter((value) => value !== id);
        const next = featured === undefined ? [id, ...rest] : [id, featured, ...rest];
        setValue("imageMediaIds", next, { shouldDirty: true });
    };

    const handleAdd = (selection: AdminMedia | AdminMedia[]) => {
        const picked = Array.isArray(selection) ? selection : [selection];
        setMany(picked.map((media) => ({ id: media.id, url: media.url })));
        const existing = new Set(ids);
        const additions = picked.filter((media) => !existing.has(media.id)).map((media) => media.id);
        if (additions.length === 0) return;
        setValue("imageMediaIds", [...ids, ...additions], { shouldDirty: true });
    };

    return (
        <div className="flex flex-col gap-2">
            <DndContext id="product-gallery" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={galleryIds} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-4 gap-2">
                        {galleryIds.map((id) => (
                            <GalleryThumb
                                key={id}
                                id={id}
                                url={getUrl(id)}
                                alt={t("thumbAlt")}
                                onRemove={() => handleRemove(id)}
                                onPromote={() => handlePromote(id)}
                                labels={{ remove: t("remove"), setFeatured: t("setAsFeatured") }}
                            />
                        ))}
                        <button
                            type="button"
                            onClick={() => setPickerOpen(true)}
                            className={cn(
                                "flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-border/60 border-dashed bg-muted/30 text-muted-foreground",
                                "hover:border-primary/40 hover:bg-muted/50 hover:text-foreground",
                                "transition-colors",
                            )}
                            aria-label={t("addImages")}
                        >
                            <ImagePlus className="size-5" aria-hidden="true" />
                            <span className="text-[10px]">{t("add")}</span>
                        </button>
                    </div>
                </SortableContext>
            </DndContext>

            {galleryIds.length === 0 ? <p className="text-muted-foreground text-xs">{t("emptyHint")}</p> : null}

            <MediaPicker open={pickerOpen} mode="multiple" value={ids} onOpenChange={setPickerOpen} onSelect={handleAdd} />
        </div>
    );
}

interface GalleryThumbProps {
    id: number;
    url: string | null;
    alt: string;
    onRemove: () => void;
    onPromote: () => void;
    labels: { remove: string; setFeatured: string };
}

function GalleryThumb({ id, url, alt, onRemove, onPromote, labels }: GalleryThumbProps) {
    const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });
    const style: CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={cn(
                "group relative aspect-square touch-none overflow-hidden rounded-md border border-border/60 bg-muted/20",
                isDragging && "z-10 opacity-60 ring-2 ring-primary/40",
            )}
        >
            {url === null ? (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground/60">
                    <ImageIcon className="size-4" aria-hidden="true" />
                </div>
            ) : (
                // biome-ignore lint/performance/noImgElement: media thumbnail, no Next/Image loader configured
                <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" />
            )}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-0.5 p-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <button
                    type="button"
                    aria-label={labels.setFeatured}
                    onClick={(event) => {
                        event.stopPropagation();
                        onPromote();
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="grid size-5 place-items-center rounded bg-background/85 text-foreground/80 backdrop-blur hover:bg-background hover:text-warning"
                >
                    <Star className="size-3" aria-hidden="true" />
                </button>
                <button
                    type="button"
                    aria-label={labels.remove}
                    onClick={(event) => {
                        event.stopPropagation();
                        onRemove();
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="grid size-5 place-items-center rounded bg-background/85 text-foreground/80 backdrop-blur hover:bg-background hover:text-destructive"
                >
                    <X className="size-3" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
