import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import type * as React from "react";

import { cn } from "#/lib/utils";

function AlertDialog(props: React.ComponentProps<typeof BaseAlertDialog.Root>) {
    return <BaseAlertDialog.Root {...props} />;
}

function AlertDialogTrigger(props: React.ComponentProps<typeof BaseAlertDialog.Trigger>) {
    return <BaseAlertDialog.Trigger {...props} />;
}

function AlertDialogPortal(props: React.ComponentProps<typeof BaseAlertDialog.Portal>) {
    return <BaseAlertDialog.Portal {...props} />;
}

/**
 * Modal confirm dialog. Differs from {@link Dialog} only in semantics — Base UI marks it as a
 * role="alertdialog" with no dismiss-on-outside-click, so destructive actions cannot be cancelled
 * by mis-clicking the backdrop.
 */
function AlertDialogContent({ className, children, ...props }: React.ComponentProps<typeof BaseAlertDialog.Popup>) {
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

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
    return <div data-slot="alert-dialog-header" className={cn("flex flex-col gap-1.5 text-start", className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="alert-dialog-footer"
            className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
            {...props}
        />
    );
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof BaseAlertDialog.Title>) {
    return (
        <BaseAlertDialog.Title
            data-slot="alert-dialog-title"
            className={cn("font-semibold text-lg leading-none", className)}
            {...props}
        />
    );
}

function AlertDialogDescription({ className, ...props }: React.ComponentProps<typeof BaseAlertDialog.Description>) {
    return (
        <BaseAlertDialog.Description
            data-slot="alert-dialog-description"
            className={cn("text-muted-foreground text-sm", className)}
            {...props}
        />
    );
}

function AlertDialogClose(props: React.ComponentProps<typeof BaseAlertDialog.Close>) {
    return <BaseAlertDialog.Close {...props} />;
}

export {
    AlertDialog,
    AlertDialogClose,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogPortal,
    AlertDialogTitle,
    AlertDialogTrigger,
};
