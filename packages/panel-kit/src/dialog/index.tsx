"use client";

import type { ReactNode } from "react";

import {
    DialogBody,
    DialogClose,
    DialogContent,
    type DialogContentProps,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogPortal,
    DialogRoot,
    DialogTitle,
    DialogTrigger,
} from "./dialog.parts";

export interface DialogProps {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: ReactNode;
    title?: ReactNode;
    description?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    /** Body renders a skeleton while true; header + footer keep rendering. */
    isLoading?: boolean;
    /** Width cap. Default `md` (28rem). */
    size?: "sm" | "md" | "lg" | "xl";
    /** Hide the built-in × close affordance. Esc + backdrop click still close the dialog. */
    hideClose?: boolean;
}

/**
 * Convenience wrapper for the 90% dialog case (modal with title + body + footer). Reach for the
 * compound subparts (`DialogRoot` / `DialogContent` / `DialogHeader` / …) when you need a custom
 * header layout, side-by-side panes, or anything beyond the default vertical stack.
 *
 * Calendar pickers always use `Dialog`, not `Popover` — see `DESIGN_SYSTEM.md` §3.8.
 */
export function Dialog({
    open,
    defaultOpen,
    onOpenChange,
    trigger,
    title,
    description,
    children,
    footer,
    isLoading,
    size = "md",
    hideClose,
}: DialogProps) {
    const hasHeader = title !== undefined || description !== undefined;
    return (
        <DialogRoot open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
            {trigger !== undefined && <DialogTrigger render={trigger as never} />}
            <DialogContent size={size} hideClose={hideClose}>
                {hasHeader && (
                    <DialogHeader>
                        {title !== undefined && <DialogTitle>{title}</DialogTitle>}
                        {description !== undefined && <DialogDescription>{description}</DialogDescription>}
                    </DialogHeader>
                )}
                <DialogBody isLoading={isLoading}>{children}</DialogBody>
                {footer !== undefined && <DialogFooter>{footer}</DialogFooter>}
            </DialogContent>
        </DialogRoot>
    );
}
Dialog.displayName = "Dialog";

export type { DialogContentProps };
export {
    DialogBody,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogPortal,
    DialogRoot,
    DialogTitle,
    DialogTrigger,
};
