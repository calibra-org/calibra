"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

import type { AdminMediaVariants } from "#/lib/types";

/** A media reference the gallery/featured cards render — the original URL + its resized variants. */
export interface MediaRef {
    url: string;
    variants: AdminMediaVariants | null;
}

interface MediaUrlMap {
    getMedia: (id: number) => MediaRef | null;
    setMedia: (id: number, ref: MediaRef) => void;
    setManyMedia: (entries: { id: number; ref: MediaRef | null }[]) => void;
}

const MediaUrlMapCtx = createContext<MediaUrlMap | null>(null);

interface MediaUrlMapProviderProps {
    /** Seed entries from `AdminProductDetailView.images` — `{ id: media_id, url, variants }`. Null urls drop. */
    initial: { id: number; url: string | null; variants: AdminMediaVariants | null }[];
    children: ReactNode;
}

/**
 * Holds the `media_id → { url, variants }` map shared by the Featured-image and Gallery sidebar
 * cards. The form schema stores `imageMediaIds: number[]` (ids only) so the wire payload stays
 * compact; the two cards need the URL + variants to render *optimized* thumbnails. We seed from the
 * loaded product's `images[]` (which now carries variants) and append every fresh ref the
 * {@link MediaPicker} returns. Stored as a React `Map` in state so re-renders pick up new refs.
 */
export function MediaUrlMapProvider({ initial, children }: MediaUrlMapProviderProps) {
    const [map, setMap] = useState<Map<number, MediaRef>>(() => {
        const next = new Map<number, MediaRef>();
        for (const row of initial) {
            if (row.url !== null) next.set(row.id, { url: row.url, variants: row.variants });
        }
        return next;
    });

    const getMedia = useCallback((id: number) => map.get(id) ?? null, [map]);

    const setMedia = useCallback((id: number, ref: MediaRef) => {
        setMap((previous) => {
            if (previous.get(id)?.url === ref.url) return previous;
            const next = new Map(previous);
            next.set(id, ref);
            return next;
        });
    }, []);

    const setManyMedia = useCallback((entries: { id: number; ref: MediaRef | null }[]) => {
        setMap((previous) => {
            let next: Map<number, MediaRef> | null = null;
            for (const entry of entries) {
                if (entry.ref === null) continue;
                if (previous.get(entry.id)?.url === entry.ref.url) continue;
                if (next === null) next = new Map(previous);
                next.set(entry.id, entry.ref);
            }
            return next ?? previous;
        });
    }, []);

    const value = useMemo<MediaUrlMap>(() => ({ getMedia, setMedia, setManyMedia }), [getMedia, setMedia, setManyMedia]);
    return <MediaUrlMapCtx.Provider value={value}>{children}</MediaUrlMapCtx.Provider>;
}

/** Read accessor for the shared media map. Throws when used outside the provider. */
export function useMediaUrlMap(): MediaUrlMap {
    const ctx = useContext(MediaUrlMapCtx);
    if (ctx === null) throw new Error("useMediaUrlMap must be used within MediaUrlMapProvider");
    return ctx;
}
