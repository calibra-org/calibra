"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

interface MediaUrlMap {
    getUrl: (id: number) => string | null;
    setUrl: (id: number, url: string) => void;
    setMany: (entries: { id: number; url: string | null }[]) => void;
}

const MediaUrlMapCtx = createContext<MediaUrlMap | null>(null);

interface MediaUrlMapProviderProps {
    /** Seed entries from `AdminProductDetailView.images` — `{ id: media_id, url }`. Nulls are dropped. */
    initial: { id: number; url: string | null }[];
    children: ReactNode;
}

/**
 * Holds the `media_id → url` map shared by the Featured-image and Gallery sidebar cards.
 *
 * The form schema stores `imageMediaIds: number[]` (ids only) so the wire payload stays compact
 * and the storefront's storefront-side image fan-out remains the source of truth. The two cards
 * need the URL to render thumbnails, so we seed a side-table from the loaded product's
 * `images[]` and append every fresh URL the {@link MediaPicker} returns. Stored as a React
 * `Map` in state so re-renders pick up the latest URL once a new media row is chosen.
 */
export function MediaUrlMapProvider({ initial, children }: MediaUrlMapProviderProps) {
    const [map, setMap] = useState<Map<number, string>>(() => {
        const next = new Map<number, string>();
        for (const row of initial) {
            if (row.url !== null) next.set(row.id, row.url);
        }
        return next;
    });

    const getUrl = useCallback((id: number) => map.get(id) ?? null, [map]);

    const setUrl = useCallback((id: number, url: string) => {
        setMap((previous) => {
            if (previous.get(id) === url) return previous;
            const next = new Map(previous);
            next.set(id, url);
            return next;
        });
    }, []);

    const setMany = useCallback((entries: { id: number; url: string | null }[]) => {
        setMap((previous) => {
            let next: Map<number, string> | null = null;
            for (const entry of entries) {
                if (entry.url === null) continue;
                if (previous.get(entry.id) === entry.url) continue;
                if (next === null) next = new Map(previous);
                next.set(entry.id, entry.url);
            }
            return next ?? previous;
        });
    }, []);

    const value = useMemo<MediaUrlMap>(() => ({ getUrl, setUrl, setMany }), [getUrl, setUrl, setMany]);
    return <MediaUrlMapCtx.Provider value={value}>{children}</MediaUrlMapCtx.Provider>;
}

/** Read accessor for the shared media URL map. Throws when used outside the provider. */
export function useMediaUrlMap(): MediaUrlMap {
    const ctx = useContext(MediaUrlMapCtx);
    if (ctx === null) throw new Error("useMediaUrlMap must be used within MediaUrlMapProvider");
    return ctx;
}
