"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { toast } from "#/components/ui/toast";
import { loadFavorites } from "#/lib/products/favorites";
import { useToggleFavorite } from "#/lib/products/mutations";
import { cn } from "#/lib/utils";

interface FavoriteToggleProps {
    productId: number;
    initialIsFavorite: boolean;
}

/**
 * Optimistic star toggle. We render against a small local state so the flip is instant; the
 * mutation persists the change. On failure we revert and surface a toast — currently a no-op in
 * the localStorage stub but already wired for the real round-trip.
 */
export function FavoriteToggle({ productId, initialIsFavorite }: FavoriteToggleProps) {
    const t = useTranslations("Products.list");
    const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
    const { mutateAsync } = useToggleFavorite();

    useEffect(() => {
        setIsFavorite(initialIsFavorite);
    }, [initialIsFavorite]);

    const onToggle = useCallback(
        async (event: React.MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
            const next = !isFavorite;
            setIsFavorite(next);
            try {
                await mutateAsync({ id: productId });
                toast.add({
                    title: next ? t("favoriteAdded") : t("favoriteRemoved"),
                    timeout: 2000,
                    data: { tone: "success" },
                });
            } catch {
                setIsFavorite(!next);
                toast.add({ title: t("favoriteFailed"), timeout: 4000, data: { tone: "error" } });
            }
        },
        [isFavorite, mutateAsync, productId, t],
    );

    return (
        <button
            type="button"
            onClick={onToggle}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? t("removeFromFavorites") : t("addToFavorites")}
            className={cn(
                "grid size-7 place-items-center rounded-full outline-none transition-colors",
                "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                isFavorite ? "text-warning" : "text-foreground/40 hover:text-warning",
            )}
        >
            <Star className={cn("size-4 transition-transform", isFavorite && "fill-warning")} aria-hidden="true" />
        </button>
    );
}

/** Hook variant for callers that need to read the current favorites set. */
export function useFavorites(): { favorites: Set<number>; isFavorite: (id: number) => boolean } {
    const [favorites, setFavorites] = useState<Set<number>>(new Set());
    useEffect(() => {
        setFavorites(loadFavorites());
        const onStorage = (event: StorageEvent) => {
            if (event.key === "admin.products.favorites") setFavorites(loadFavorites());
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);
    return {
        favorites,
        isFavorite: (id: number) => favorites.has(id),
    };
}
