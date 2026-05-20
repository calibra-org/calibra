"use client";

import { Toast as BaseToast } from "@base-ui/react/toast";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

/** Single app-wide toast manager. Import it from anywhere to enqueue notifications. */
export const toast = BaseToast.createToastManager();

type ToastTone = "success" | "error" | "warning" | "info";

const toneIcons: Record<ToastTone, ReactNode> = {
    success: <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />,
    error: <XCircle className="size-4 text-rose-500" aria-hidden="true" />,
    warning: <TriangleAlert className="size-4 text-amber-500" aria-hidden="true" />,
    info: <Info className="size-4 text-sky-500" aria-hidden="true" />,
};

interface ToastListProps {
    /** Optional override label for the close button (defaults to plain X icon). */
    closeLabel?: string;
}

/**
 * Renders the active toast queue using {@link BaseToast.Root} children. Mount once near the root
 * of the app inside a {@link BaseToast.Provider}. Each toast picks up its tone from the optional
 * `data.tone` value supplied via {@link toast.add}.
 */
function ToastList({ closeLabel = "Close" }: ToastListProps) {
    const { toasts } = BaseToast.useToastManager();
    return (
        <>
            {toasts.map((t) => {
                const tone = (t.data as { tone?: ToastTone } | undefined)?.tone ?? "info";
                return (
                    <BaseToast.Root
                        key={t.id}
                        toast={t}
                        className={cn(
                            "pointer-events-auto grid w-[min(360px,calc(100vw-2rem))] grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-lg outline-none",
                            "absolute end-0 bottom-0 [transform:translateY(var(--toast-offset-y))_scale(calc(1-var(--toast-index)*0.04))]",
                            "transition-[opacity,transform] duration-200",
                            "data-[expanded]:[transform:translateY(calc(var(--toast-offset-y)*-1))]",
                            "data-[starting-style]:translate-y-full data-[starting-style]:opacity-0",
                            "data-[ending-style]:opacity-0",
                        )}
                    >
                        <div className="mt-0.5">{toneIcons[tone]}</div>
                        <div className="flex flex-col gap-0.5">
                            {t.title !== undefined && (
                                <BaseToast.Title className="font-medium text-foreground text-sm leading-tight" />
                            )}
                            {t.description !== undefined && <BaseToast.Description className="text-muted-foreground text-sm" />}
                        </div>
                        <BaseToast.Close
                            className="rounded-sm p-1 text-muted-foreground opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={closeLabel}
                        >
                            <X className="size-4" aria-hidden="true" />
                        </BaseToast.Close>
                    </BaseToast.Root>
                );
            })}
        </>
    );
}

/**
 * Mounts the toast provider, portal, viewport, and rendered queue. Wrap the authenticated app
 * shell in this once — child components fire toasts via the shared {@link toast} manager.
 */
export function Toaster({ closeLabel }: ToastListProps = {}) {
    return (
        <BaseToast.Provider toastManager={toast} limit={4}>
            <BaseToast.Portal>
                <BaseToast.Viewport className="pointer-events-none fixed end-4 bottom-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col items-end gap-2">
                    <ToastList closeLabel={closeLabel} />
                </BaseToast.Viewport>
            </BaseToast.Portal>
        </BaseToast.Provider>
    );
}
