"use client";

import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { cn } from "@calibra/shared";
import type { ComponentProps, ReactNode } from "react";

import { Button } from "../button";

/**
 * Root passthrough for the compound `AlertDialog` shape (`<AlertDialog open><Content>…</Content></AlertDialog>`).
 * Re-exported as `AlertDialog` below for backwards-compat with the existing flat-API call sites.
 */
export function AlertDialogRoot(props: ComponentProps<typeof BaseAlertDialog.Root>) {
    return <BaseAlertDialog.Root data-slot="alert-dialog-root" {...props} />;
}
AlertDialogRoot.displayName = "AlertDialogRoot";

/**
 * Backwards-compat alias for {@link AlertDialogRoot}. Existing views use
 * `<AlertDialog open onOpenChange>…</AlertDialog>` as the root; that shape continues to work.
 * For the convenience confirm-pattern wrapper see {@link ConfirmDialog} below.
 */
export const AlertDialog = AlertDialogRoot;

export function AlertDialogTrigger(props: ComponentProps<typeof BaseAlertDialog.Trigger>) {
    return <BaseAlertDialog.Trigger data-slot="alert-dialog-trigger" {...props} />;
}
AlertDialogTrigger.displayName = "AlertDialogTrigger";

export function AlertDialogPortal(props: ComponentProps<typeof BaseAlertDialog.Portal>) {
    return <BaseAlertDialog.Portal {...props} />;
}
AlertDialogPortal.displayName = "AlertDialogPortal";

/**
 * Confirm-dialog content. Differs from `Dialog` only in semantics — Base UI marks it as
 * `role="alertdialog"` with no dismiss-on-outside-click, so destructive actions cannot be
 * cancelled by mis-clicking the backdrop.
 */
export function AlertDialogContent({ className, children, ...props }: ComponentProps<typeof BaseAlertDialog.Popup>) {
    return (
        <AlertDialogPortal>
            <BaseAlertDialog.Backdrop
                className={cn(
                    "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
                    "transition-opacity duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none",
                )}
            />
            <BaseAlertDialog.Popup
                data-slot="alert-dialog-content"
                className={cn(
                    "fixed top-1/2 left-1/2 z-50 grid w-full max-w-md gap-4 rounded-lg border border-border bg-card p-6 shadow-lg outline-none",
                    "[transform:translate(-50%,-50%)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[ending-style]:[transform:translate(-50%,-46%)] data-[starting-style]:[transform:translate(-50%,-46%)]",
                    "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
                    className,
                )}
                {...props}
            >
                {children}
            </BaseAlertDialog.Popup>
        </AlertDialogPortal>
    );
}
AlertDialogContent.displayName = "AlertDialogContent";

export function AlertDialogHeader({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="alert-dialog-header" className={cn("flex flex-col gap-1.5 text-start", className)} {...props} />;
}
AlertDialogHeader.displayName = "AlertDialogHeader";

export function AlertDialogFooter({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="alert-dialog-footer"
            className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
            {...props}
        />
    );
}
AlertDialogFooter.displayName = "AlertDialogFooter";

export function AlertDialogTitle({ className, ...props }: ComponentProps<typeof BaseAlertDialog.Title>) {
    return (
        <BaseAlertDialog.Title
            data-slot="alert-dialog-title"
            className={cn("font-semibold text-lg leading-none", className)}
            {...props}
        />
    );
}
AlertDialogTitle.displayName = "AlertDialogTitle";

export function AlertDialogDescription({ className, ...props }: ComponentProps<typeof BaseAlertDialog.Description>) {
    return (
        <BaseAlertDialog.Description
            data-slot="alert-dialog-description"
            className={cn("text-muted-foreground text-sm", className)}
            {...props}
        />
    );
}
AlertDialogDescription.displayName = "AlertDialogDescription";

export function AlertDialogClose(props: ComponentProps<typeof BaseAlertDialog.Close>) {
    return <BaseAlertDialog.Close data-slot="alert-dialog-close" {...props} />;
}
AlertDialogClose.displayName = "AlertDialogClose";

export interface ConfirmDialogProps {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    /** Confirm-button label. Required — alert dialogs always have at least one action. */
    confirmLabel: ReactNode;
    /** Cancel-button label. Renders an outline button beside the confirm action. */
    cancelLabel?: ReactNode;
    /** Tone for the confirm button. Defaults to `default` (primary); use `danger` for destructive actions. */
    tone?: "default" | "danger" | "warning";
    isConfirming?: boolean;
    onConfirm: () => void;
    onCancel?: () => void;
}

/**
 * Convenience wrapper for the 90% alert case — confirm a destructive or important action. Reach
 * for the compound subparts ({@link AlertDialogRoot} / {@link AlertDialogContent} / …) when you
 * need richer body content (forms, lists) than a single description string can carry.
 *
 * Named `ConfirmDialog` so it doesn't collide with the existing `AlertDialog` root passthrough.
 *
 * ```tsx
 * <ConfirmDialog
 *   open={confirmOpen}
 *   onOpenChange={setConfirmOpen}
 *   title={t("orders.cancelTitle")}
 *   description={t("orders.cancelBody")}
 *   confirmLabel={t("orders.confirmCancel")}
 *   cancelLabel={t("common.keepEditing")}
 *   tone="danger"
 *   isConfirming={cancel.isPending}
 *   onConfirm={() => cancel.mutate(orderId)}
 * />
 * ```
 */
export function ConfirmDialog({
    open,
    defaultOpen,
    onOpenChange,
    trigger,
    title,
    description,
    confirmLabel,
    cancelLabel,
    tone = "default",
    isConfirming,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const confirmToneProps =
        tone === "danger"
            ? { variant: "default" as const, tone: "danger" as const }
            : tone === "warning"
              ? { variant: "default" as const, tone: "warning" as const }
              : { variant: "default" as const };
    return (
        <AlertDialogRoot open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
            {trigger !== undefined && <AlertDialogTrigger render={trigger as never} />}
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    {description !== undefined && <AlertDialogDescription>{description}</AlertDialogDescription>}
                </AlertDialogHeader>
                <AlertDialogFooter>
                    {cancelLabel !== undefined && (
                        <AlertDialogClose
                            render={(props) => (
                                <Button {...props} type="button" variant="outline" onClick={onCancel}>
                                    {cancelLabel}
                                </Button>
                            )}
                        />
                    )}
                    <Button {...confirmToneProps} type="button" isLoading={isConfirming} onClick={onConfirm}>
                        {confirmLabel}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialogRoot>
    );
}
ConfirmDialog.displayName = "ConfirmDialog";
