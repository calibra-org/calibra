"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;
const WHEEL_STEP = 1.1;
/** How long after the last wheel tick the anchor + transition-suppression stay locked. */
const WHEEL_SESSION_MS = 280;

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
    const wheelSessionRef = useRef<{ x: number; y: number; expires: number; timer: number | null }>({
        x: 0,
        y: 0,
        expires: 0,
        timer: null,
    });
    const [animateTransition, setAnimateTransition] = useState(true);

    /**
     * Zoom from a specific cursor anchor (Figma / Google Maps semantics): the point under
     * the cursor stays under the cursor before and after the zoom. Math (with `origin-top-left`
     * on the inner container):
     *
     *   newPan = cursorContainer - (cursorContainer - pan) * (newZoom / oldZoom)
     *
     * `cursorContainer` is the cursor position relative to the wrapper's top-left.
     */
    const setZoomAt = useCallback((next: number, cursorContainerX: number, cursorContainerY: number) => {
        setZoom((current) => {
            const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
            if (clamped === current) return current;
            if (clamped === 1) {
                setPan({ x: 0, y: 0 });
                return clamped;
            }
            const ratio = clamped / current;
            setPan((prev) => ({
                x: cursorContainerX - (cursorContainerX - prev.x) * ratio,
                y: cursorContainerY - (cursorContainerY - prev.y) * ratio,
            }));
            return clamped;
        });
    }, []);

    /** Button-driven zoom anchors at the container centre (no cursor context). */
    const setBoundedZoomFromCenter = useCallback(
        (next: number) => {
            const el = containerRef.current;
            if (!el) {
                setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
                return;
            }
            const rect = el.getBoundingClientRect();
            setZoomAt(next, rect.width / 2, rect.height / 2);
        },
        [setZoomAt],
    );

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

    /**
     * Wheel zoom — bound natively so `passive: false` works under React 19. The first wheel
     * tick captures the cursor as the session anchor; every subsequent tick within
     * `WHEEL_SESSION_MS` reuses that anchor, so rapid scrolling zooms into the user's original
     * intent point instead of drifting along with the animated cursor-relative drift. CSS
     * transitions are suppressed during a wheel session so individual ticks read as immediate
     * — the transition re-engages once the session expires (for the next button click etc).
     */
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const now = performance.now();
            const session = wheelSessionRef.current;

            if (now > session.expires) {
                /** New session — capture the cursor as the anchor for the burst. */
                session.x = e.clientX - rect.left;
                session.y = e.clientY - rect.top;
                setAnimateTransition(false);
            }
            session.expires = now + WHEEL_SESSION_MS;
            if (session.timer !== null) window.clearTimeout(session.timer);
            session.timer = window.setTimeout(() => {
                session.timer = null;
                setAnimateTransition(true);
            }, WHEEL_SESSION_MS);

            const direction = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
            setZoomAt(zoom * direction, session.x, session.y);
        };
        el.addEventListener("wheel", handler, { passive: false });
        return () => el.removeEventListener("wheel", handler);
    }, [zoom, setZoomAt]);

    useEffect(
        () => () => {
            if (wheelSessionRef.current.timer !== null) window.clearTimeout(wheelSessionRef.current.timer);
        },
        [],
    );

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
                className={cn("origin-top-left", animateTransition && "transition-transform duration-150 ease-out")}
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
                    onClick={() => setBoundedZoomFromCenter(zoom / ZOOM_STEP)}
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
                    onClick={() => setBoundedZoomFromCenter(zoom * ZOOM_STEP)}
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
