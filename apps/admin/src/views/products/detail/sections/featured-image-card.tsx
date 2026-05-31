"use client";

import { ImagePlus, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

import { MediaPicker } from "#/components/media-picker";
import { Button } from "#/components/ui/button";
import { variantUrl } from "#/lib/media-variants";
import type { AdminMedia } from "#/lib/types";
import { cn } from "#/lib/utils";

import type { ProductDetailFormValues } from "../schema";

import { useMediaUrlMap } from "./media-url-map";

/**
 * Sidebar Featured-image card. The form schema treats `imageMediaIds[0]` as the featured slot
 * (the storefront's `ProductTransformer` orders `images` by `position`, so index 0 is the
 * canonical featured image — no `featured_media_id` column exists).
 *
 * "Remove" SHIFTS the gallery: the next gallery image (`imageMediaIds[1]`) is promoted to
 * featured, instead of leaving a hole. Operators get a one-click rollback by re-opening the
 * picker; this matches Shopify's behaviour and avoids WP's "no featured" gap.
 */
export function FeaturedImageBody() {
    const t = useTranslations("Products.detail.featuredImage");
    const tField = useTranslations("Products.detail.fields");
    const { watch, setValue } = useFormContext<ProductDetailFormValues>();
    const { getMedia, setMedia } = useMediaUrlMap();
    const [pickerOpen, setPickerOpen] = useState(false);

    const ids = watch("imageMediaIds");
    const featuredId = ids[0] ?? null;
    const featuredRef = featuredId === null ? null : getMedia(featuredId);
    const featuredUrl = featuredRef ? variantUrl(featuredRef, "large") : null;

    const handleSelect = (selection: AdminMedia | AdminMedia[]) => {
        const picked = Array.isArray(selection) ? selection[0] : selection;
        if (picked === undefined) return;
        setMedia(picked.id, { url: picked.url, variants: picked.variants });
        const rest = ids.slice(1).filter((value) => value !== picked.id);
        setValue("imageMediaIds", [picked.id, ...rest], { shouldDirty: true });
    };

    const handleRemove = () => {
        setValue("imageMediaIds", ids.slice(1), { shouldDirty: true });
    };

    return (
        <div className="flex flex-col gap-2">
            <div
                className={cn(
                    "relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-border/60 border-dashed bg-muted/30",
                    "hover:border-primary/40 hover:bg-muted/50",
                    "transition-colors",
                )}
            >
                {featuredUrl === null ? (
                    <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
                        aria-label={t("setProductImage")}
                    >
                        <ImagePlus className="size-6" aria-hidden="true" />
                        <span className="text-xs">{t("setProductImage")}</span>
                    </button>
                ) : (
                    <>
                        {/* biome-ignore lint/performance/noImgElement: media preview, no Next/Image loader configured */}
                        <img
                            src={featuredUrl}
                            alt={tField("featured")}
                            loading="lazy"
                            className="h-full w-full object-contain p-2"
                        />
                        <div className="absolute end-2 top-2 flex items-center gap-1">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setPickerOpen(true)}
                                className="h-7 gap-1 bg-background/85 px-2 text-xs backdrop-blur"
                            >
                                <Pencil className="size-3" aria-hidden="true" />
                                {t("replace")}
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={handleRemove}
                                className="h-7 gap-1 bg-background/85 px-2 text-xs backdrop-blur"
                            >
                                <X className="size-3" aria-hidden="true" />
                                {t("remove")}
                            </Button>
                        </div>
                    </>
                )}
            </div>
            {featuredUrl !== null && ids.length > 1 ? (
                <p className="text-muted-foreground text-xs">{t("removeShiftsGalleryHint")}</p>
            ) : null}

            <MediaPicker
                open={pickerOpen}
                mode="single"
                value={featuredId}
                onOpenChange={setPickerOpen}
                onSelect={handleSelect}
            />
        </div>
    );
}
