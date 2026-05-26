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

interface DragState {
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
}

/**
 * Wraps the regional map SVG with a contained zoom + pan widget. Zoom level applied as a CSS
 * `transform: translate(...) scale(...)` on the inner container so the SVG geometry stays
 * intact — no viewBox math, no jitter, no impact on the page's own scroll/zoom.
 *
 * Pan modes (Figma-style):
 *
 *   - **Hold space + left-drag** → grab cursor; click-and-drag moves the map.
 *   - **Middle-mouse drag** → same, without needing space (handy on three-button mice).
 *
 * The wheel handler attaches with `passive: false` so `preventDefault()` traps mouse-wheel
 * zoom over the map and never propagates to the document scroll.
 */
export function MapZoomWrapper({ children, className }: MapZoomWrapperProps) {
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [spaceHeld, setSpaceHeld] = useState(false);
    const [dragging, setDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<DragState | null>(null);

    const setBoundedZoom = useCallback((next: number) => {
        setZoom((current) => {
            const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
            /** Snap pan back to centre when fully zoomed out — nothing left to pan to. */
            if (clamped === 1) setPan({ x: 0, y: 0 });
            return clamped;
        });
    }, []);

    const resetAll = useCallback(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }, []);

    /** Spacebar key tracker — global so the cursor changes anywhere over the wrapper. */
    useEffect(() => {
        const isEditable = (el: EventTarget | null) => {
            if (!(el instanceof HTMLElement)) return false;
            const tag = el.tagName;
            return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
        };
        const down = (e: KeyboardEvent) => {
            if (e.code === "Space" && !isEditable(e.target)) {
                e.preventDefault();
                setSpaceHeld(true);
            }
        };
        const up = (e: KeyboardEvent) => {
            if (e.code === "Space") setSpaceHeld(false);
        };
        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        return () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
        };
    }, []);

    /** Wheel zoom — bound natively so `passive: false` works under React 19. */
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

    const onPointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            const wantsPan = e.button === 1 || (e.button === 0 && spaceHeld);
            if (!wantsPan) return;
            e.preventDefault();
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            dragRef.current = {
                pointerId: e.pointerId,
                startClientX: e.clientX,
                startClientY: e.clientY,
                startPanX: pan.x,
                startPanY: pan.y,
            };
            setDragging(true);
        },
        [pan.x, pan.y, spaceHeld],
    );

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const dx = e.clientX - drag.startClientX;
        const dy = e.clientY - drag.startClientY;
        setPan({ x: drag.startPanX + dx, y: drag.startPanY + dy });
    }, []);

    const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
        dragRef.current = null;
        setDragging(false);
    }, []);

    /** Suppress middle-click auto-scroll cursor + paste-on-middle in some browsers. */
    const onAuxClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button === 1) e.preventDefault();
    }, []);

    const pct = Math.round(zoom * 100);
    const canPan = spaceHeld || dragging;
    const cursor = dragging ? "grabbing" : canPan ? "grab" : "auto";

    return (
        <div
            className={cn("relative overflow-hidden rounded-lg border bg-card select-none", className)}
            ref={containerRef}
            style={{ cursor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onAuxClick={onAuxClick}
        >
            <div
                className="origin-center transition-transform duration-150 ease-out"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
                {children}
            </div>
            <div className="absolute end-2 top-2 flex items-center gap-1 rounded-md border bg-background/95 p-1 shadow-sm backdrop-blur">
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
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px] tabular-nums"
                    aria-label="Reset zoom to 100%"
                    title="Reset zoom to 100%"
                    onClick={resetAll}
                >
                    {pct}%
                </Button>
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
                {pct !== 100 || pan.x !== 0 || pan.y !== 0 ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label="Reset zoom + pan"
                        title="Reset zoom + pan"
                        onClick={resetAll}
                    >
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
