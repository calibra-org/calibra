"use client";

import { Toast as BaseToast } from "@base-ui/react/toast";
import { CheckCircle2, Info, Loader2, TriangleAlert, X, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

/** Single app-wide toast manager. Import it from anywhere to enqueue notifications. */
export const toast = BaseToast.createToastManager();

type ToastTone = "success" | "error" | "warning" | "info" | "loading";

/**
 * Optional action button rendered inside the toast. When set on `data.action`, the toast renders
 * a filled primary button beneath its description; clicking it fires `onAction` and closes the
 * toast automatically.
 */
export interface ToastAction {
    label: string;
    onAction: () => void;
}

interface ToastListProps {
    /** Optional override label for the close button (defaults to plain X icon). */
    closeLabel?: string;
}

function toneIcon(tone: ToastTone): ReactNode {
    const base = "size-[1.125rem] shrink-0";
    switch (tone) {
        case "success":
            return <CheckCircle2 className={cn(base, "text-emerald-500")} aria-hidden="true" />;
        case "error":
            return <XCircle className={cn(base, "text-rose-500")} aria-hidden="true" />;
        case "warning":
            return <TriangleAlert className={cn(base, "text-amber-500")} aria-hidden="true" />;
        case "loading":
            return <Loader2 className={cn(base, "animate-spin text-muted-foreground")} aria-hidden="true" />;
        default:
            return <Info className={cn(base, "text-sky-500")} aria-hidden="true" />;
    }
}

/**
 * Renders the active toast queue using {@link BaseToast.Root} children. Mount once near the root
 * of the app inside a {@link BaseToast.Provider}. Each toast picks up its tone from the optional
 * `data.tone` value supplied via {@link toast.add}.
 *
 * Stacking model mirrors the iOS / Sonner pattern: only the front toast is fully interactive;
 * earlier toasts peek behind it, shrunk by `--scale`. Hovering or focusing the viewport flips
 * every toast to `data-expanded`, which moves each one to its full slot via `--offset-y` and
 * reveals their close buttons. Pointer-leave collapses the stack again.
 *
 * Swipe-to-dismiss is wired for down / left / right (matches the bottom-end anchor). The
 * `data-[swipe-direction=…]` rules pick the right exit transform so the toast leaves toward the
 * swiped edge instead of jumping straight down.
 */
function ToastList({ closeLabel = "Close" }: ToastListProps) {
    const { toasts } = BaseToast.useToastManager();
    return (
        <>
            {toasts.map((t) => {
                const tone = (t.data as { tone?: ToastTone } | undefined)?.tone ?? "info";
                const action = (t.data as { action?: ToastAction } | undefined)?.action;
                return (
                    <BaseToast.Root
                        key={t.id}
                        toast={t}
                        swipeDirection={["down", "left", "right"]}
                        className={cn(
                            /** Base layout — pinned to the viewport's bottom-end anchor. */
                            "absolute end-0 bottom-0 box-border w-full cursor-default select-none",
                            "rounded-xl border border-border bg-card p-4 text-card-foreground shadow-2xl bg-clip-padding outline-none",
                            /**
                             * Layer order: each toast keeps the visually-front one on top of the
                             * stack by subtracting its index from the viewport's z-1090 base.
                             */
                            "z-[calc(1090-var(--toast-index))]",
                            /** Stacking CSS vars — peek + scale create the iOS card-stack effect. */
                            "[--gap:0.625rem] [--peek:0.625rem]",
                            "[--scale:calc(max(0,1-(var(--toast-index)*0.1)))]",
                            "[--shrink:calc(1-var(--scale))]",
                            "[--height:var(--toast-frontmost-height,var(--toast-height))]",
                            "[--offset-y:calc(var(--toast-offset-y)*-1+(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]",
                            /** Long, soft transition tuned for stacking + swipe gestures. */
                            "[transition:transform_0.5s_cubic-bezier(0.22,1,0.36,1),opacity_0.5s,height_0.15s]",
                            /** Collapsed state — each card shrinks, peeks behind the front toast. */
                            "h-(--height)",
                            "transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))]",
                            /** Expanded state — hovering the viewport fans every toast out. */
                            "data-expanded:transform-[translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
                            "data-expanded:h-(--toast-height)",
                            /** Limit-exceeded toasts fade out instead of jumping. */
                            "data-limited:opacity-0",
                            /** Enter from below (bottom-anchored viewport). */
                            "data-starting-style:transform-[translateY(150%)]",
                            /** Default exit — slide out the bottom unless a swipe direction is set. */
                            "data-ending-style:opacity-0",
                            "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:transform-[translateY(150%)]",
                            /** Swipe exits — direction picks the matching translation axis. */
                            "data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+150%))]",
                            "data-expanded:data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+150%))]",
                            "data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
                            "data-expanded:data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
                            "data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
                            "data-expanded:data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
                            /**
                             * Invisible hover bridge below the toast so the gap between stacked
                             * cards doesn't break the `data-expanded` hover state.
                             */
                            "after:absolute after:inset-x-0 after:top-full after:h-[calc(var(--gap)+1px)] after:content-['']",
                        )}
                    >
                        <BaseToast.Content
                            className={cn(
                                "grid grid-cols-[auto_1fr_auto] items-start gap-x-3 transition-opacity duration-[250ms]",
                                /**
                                 * Hide content of stacked-behind toasts so their text doesn't
                                 * bleed through the peek. The front toast keeps `data-expanded`
                                 * implicitly via the primitive.
                                 */
                                "data-behind:pointer-events-none data-behind:opacity-0",
                                "data-expanded:pointer-events-auto data-expanded:opacity-100",
                            )}
                        >
                            <span className="col-start-1 row-start-1 flex shrink-0 self-start pt-px">{toneIcon(tone)}</span>
                            <div className="col-start-2 row-start-1 flex min-w-0 flex-col">
                                {t.title !== undefined && (
                                    <BaseToast.Title className="font-semibold text-foreground text-sm leading-5" />
                                )}
                                {t.description !== undefined && (
                                    <BaseToast.Description
                                        className={cn("text-muted-foreground text-sm leading-5", t.title !== undefined && "mt-1")}
                                    />
                                )}
                                {action !== undefined && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            action.onAction();
                                            toast.close(t.id);
                                        }}
                                        className={cn(
                                            "mt-3 inline-flex max-w-max items-center justify-center rounded-md px-2.5 py-1",
                                            "bg-primary font-medium text-primary-foreground text-xs hover:bg-primary/90",
                                            "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                                        )}
                                    >
                                        {action.label}
                                    </button>
                                )}
                            </div>
                            <BaseToast.Close
                                className={cn(
                                    "col-start-3 row-start-1 flex size-6 shrink-0 items-center justify-center self-start justify-self-end",
                                    "rounded border-none bg-transparent text-muted-foreground transition-colors",
                                    "hover:bg-muted hover:text-foreground",
                                    "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1",
                                )}
                                aria-label={closeLabel}
                            >
                                <X className="size-4" aria-hidden="true" />
                            </BaseToast.Close>
                        </BaseToast.Content>
                    </BaseToast.Root>
                );
            })}
        </>
    );
}

/**
 * Mounts the toast provider, portal, viewport, and rendered queue. Wrap the authenticated app
 * shell in this once — child components fire toasts via the shared {@link toast} manager.
 *
 * Viewport sits at `z-[1090]`, well above the Dialog backdrop's `z-50`, so toasts emitted from
 * within a modal still surface on top of the backdrop instead of disappearing behind it.
 */
export function Toaster({ closeLabel }: ToastListProps = {}) {
    return (
        <BaseToast.Provider toastManager={toast} limit={3} timeout={5000}>
            <BaseToast.Portal>
                <BaseToast.Viewport className="fixed end-4 bottom-4 z-[1090] mx-auto flex w-72 outline-0 sm:end-6 sm:bottom-6 sm:w-80">
                    <ToastList closeLabel={closeLabel} />
                </BaseToast.Viewport>
            </BaseToast.Portal>
        </BaseToast.Provider>
    );
}
