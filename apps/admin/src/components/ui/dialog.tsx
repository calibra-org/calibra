import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type * as React from "react";

import { cn } from "#/lib/utils";

function Dialog(props: React.ComponentProps<typeof BaseDialog.Root>) {
    return <BaseDialog.Root {...props} />;
}

function DialogTrigger(props: React.ComponentProps<typeof BaseDialog.Trigger>) {
    return <BaseDialog.Trigger {...props} />;
}

function DialogPortal(props: React.ComponentProps<typeof BaseDialog.Portal>) {
    return <BaseDialog.Portal {...props} />;
}

function DialogClose(props: React.ComponentProps<typeof BaseDialog.Close>) {
    return <BaseDialog.Close {...props} />;
}

function DialogContent({ className, children, ...props }: React.ComponentProps<typeof BaseDialog.Popup>) {
    return (
        <DialogPortal>
            <BaseDialog.Backdrop
                className={cn(
                    "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
                    "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150",
                )}
            />
            <BaseDialog.Popup
                data-slot="dialog-content"
                className={cn(
                    "fixed top-1/2 left-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-card p-6 shadow-lg outline-none",
                    "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
                    "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
                    "transition-[opacity,transform] duration-200",
                    className,
                )}
                {...props}
            >
                {children}
                <BaseDialog.Close
                    className="absolute end-4 top-4 rounded-sm opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label="Close"
                >
                    <X className="size-4" aria-hidden="true" />
                </BaseDialog.Close>
            </BaseDialog.Popup>
        </DialogPortal>
    );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
    return <div data-slot="dialog-header" className={cn("flex flex-col gap-1.5 text-start", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="dialog-footer"
            className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
            {...props}
        />
    );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof BaseDialog.Title>) {
    return <BaseDialog.Title data-slot="dialog-title" className={cn("font-semibold text-lg leading-none", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof BaseDialog.Description>) {
    return <BaseDialog.Description data-slot="dialog-description" className={cn("text-muted-foreground text-sm", className)} {...props} />;
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogPortal, DialogTitle, DialogTrigger };
