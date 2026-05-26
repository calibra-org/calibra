"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;
const WHEEL_STEP = 1.1;

interface MapZoomWrapperProps {
    children: ReactNode;
    className?: string;
}

/**
 * Wraps the regional map SVG with a contained zoom + pan widget. Zoom level is local state
 * applied as a CSS `transform: scale(...)` on the inner container so the SVG geometry stays
 * intact — no viewBox math, no jitter, no impact on the page's own scroll/zoom. The wheel
 * handler calls `preventDefault()` on `passive: false` so mouse-wheel zoom is captured ONLY
 * over the map and never propagates to the document.
 *
 * Controls overlay the top-end corner of the wrapper: `+` zooms in (× 1.25), `−` zooms out
 * (÷ 1.25), and the reset chip shows the current percentage and snaps back to 100% on click.
 */
export function MapZoomWrapper({ children, className }: MapZoomWrapperProps) {
    const [zoom, setZoom] = useState(1);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const setBoundedZoom = useCallback((next: number) => {
        setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
    }, []);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            e.preventDefault();
            const direction = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
            setBoundedZoom(zoom * direction);
        };
        el.addEventListener("wheel", handler, { passive: false });
        return () => el.removeEventListener("wheel", handler);
    }, [zoom, setBoundedZoom]);

    const pct = Math.round(zoom * 100);

    return (
        <div className={cn("relative overflow-hidden rounded-lg border bg-card", className)} ref={containerRef}>
            <div className="origin-center transition-transform duration-150 ease-out" style={{ transform: `scale(${zoom})` }}>
                {children}
            </div>
            <div className="absolute end-2 top-2 flex flex-col gap-1 rounded-md border bg-background/95 p-1 shadow-sm backdrop-blur">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Zoom in"
                    title="Zoom in"
                    onClick={() => setBoundedZoom(zoom * ZOOM_STEP)}
                    disabled={zoom >= MAX_ZOOM - 0.001}
                >
                    <Plus className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 text-[10px] tabular-nums"
                    aria-label="Reset zoom"
                    title="Reset zoom"
                    onClick={() => setBoundedZoom(1)}
                >
                    {pct}%
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Zoom out"
                    title="Zoom out"
                    onClick={() => setBoundedZoom(zoom / ZOOM_STEP)}
                    disabled={zoom <= MIN_ZOOM + 0.001}
                >
                    <Minus className="size-3.5" aria-hidden="true" />
                </Button>
                {pct !== 100 ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label="Reset to 100%"
                        title="Reset to 100%"
                        onClick={() => setBoundedZoom(1)}
                    >
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
