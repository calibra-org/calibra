"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@calibra/shared";
import type { ComponentProps, ReactNode } from "react";

import { X } from "../icons";
import { Skeleton } from "../skeleton";

export function DialogRoot(props: ComponentProps<typeof BaseDialog.Root>) {
    return <BaseDialog.Root data-slot="dialog-root" {...props} />;
}
DialogRoot.displayName = "DialogRoot";

export function DialogTrigger(props: ComponentProps<typeof BaseDialog.Trigger>) {
    return <BaseDialog.Trigger data-slot="dialog-trigger" {...props} />;
}
DialogTrigger.displayName = "DialogTrigger";

export function DialogPortal(props: ComponentProps<typeof BaseDialog.Portal>) {
    return <BaseDialog.Portal {...props} />;
}
DialogPortal.displayName = "DialogPortal";

export function DialogClose(props: ComponentProps<typeof BaseDialog.Close>) {
    return <BaseDialog.Close data-slot="dialog-close" {...props} />;
}
DialogClose.displayName = "DialogClose";

export interface DialogContentProps extends ComponentProps<typeof BaseDialog.Popup> {
    /** Hide the built-in × close affordance. Esc + backdrop click still close the dialog. */
    hideClose?: boolean;
    /** Width cap. Default `md` (28rem). */
    size?: "sm" | "md" | "lg" | "xl";
}

const SIZE_CLASS: Record<NonNullable<DialogContentProps["size"]>, string> = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
};

export function DialogContent({ className, children, hideClose = false, size = "md", ...props }: DialogContentProps) {
    return (
        <DialogPortal>
            <BaseDialog.Backdrop
                className={cn(
                    "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
                    "transition-opacity duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none",
                )}
            />
            <BaseDialog.Popup
                data-slot="dialog-content"
                className={cn(
                    "fixed top-1/2 left-1/2 z-50 grid w-full gap-4 rounded-lg border border-border bg-card p-6 shadow-lg outline-none",
                    SIZE_CLASS[size],
                    "[transform:translate(-50%,-50%)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[ending-style]:[transform:translate(-50%,-46%)] data-[starting-style]:[transform:translate(-50%,-46%)]",
                    "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
                    className,
                )}
                {...props}
            >
                {children}
                {!hideClose && (
                    <BaseDialog.Close
                        className="absolute end-4 top-4 rounded-sm opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label="Close"
                    >
                        <X className="size-4" aria-hidden="true" />
                    </BaseDialog.Close>
                )}
            </BaseDialog.Popup>
        </DialogPortal>
    );
}
DialogContent.displayName = "DialogContent";

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="dialog-header" className={cn("flex flex-col gap-1.5 text-start", className)} {...props} />;
}
DialogHeader.displayName = "DialogHeader";

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="dialog-footer"
            className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
            {...props}
        />
    );
}
DialogFooter.displayName = "DialogFooter";

export function DialogTitle({ className, ...props }: ComponentProps<typeof BaseDialog.Title>) {
    return (
        <BaseDialog.Title data-slot="dialog-title" className={cn("font-semibold text-lg leading-none", className)} {...props} />
    );
}
DialogTitle.displayName = "DialogTitle";

export function DialogDescription({ className, ...props }: ComponentProps<typeof BaseDialog.Description>) {
    return (
        <BaseDialog.Description
            data-slot="dialog-description"
            className={cn("text-muted-foreground text-sm", className)}
            {...props}
        />
    );
}
DialogDescription.displayName = "DialogDescription";

/**
 * Body slot. Pass `isLoading` to swap the contents for a `Skeleton` block while the dialog's data
 * loads — the header + footer keep rendering so the open animation doesn't visibly flash empty.
 */
export function DialogBody({ className, isLoading, children, ...props }: ComponentProps<"div"> & { isLoading?: boolean }) {
    return (
        <div data-slot="dialog-body" className={cn("min-h-0", className)} {...props}>
            {isLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-32 w-full" />
                </div>
            ) : (
                (children as ReactNode)
            )}
        </div>
    );
}
DialogBody.displayName = "DialogBody";
