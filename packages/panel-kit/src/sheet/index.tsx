"use client";

import type { ReactNode } from "react";

import {
    SheetBody,
    SheetClose,
    SheetContent,
    type SheetContentProps,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetRoot,
    type SheetSideInput,
    SheetTitle,
    SheetTrigger,
} from "./sheet.parts";

export interface SheetProps {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: ReactNode;
    side?: SheetSideInput;
    title?: ReactNode;
    description?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    /** Body renders a skeleton while true; header + footer keep rendering. */
    isLoading?: boolean;
    /** Hide the built-in × close button — use when the body has its own cancel/apply bar. */
    hideCloseButton?: boolean;
    /** Forwarded to the underlying popup for custom width / styling. */
    contentClassName?: string;
}

/**
 * Convenience wrapper for the 90% sheet case (slide-in column with title + body + footer). Compose
 * the compound subparts directly when you need a custom header layout or non-standard structure.
 *
 * ```tsx
 * <Sheet
 *   open={open}
 *   onOpenChange={setOpen}
 *   side="end"
 *   title={t("orders.editOrder")}
 *   description={t("orders.editOrderSubtitle")}
 *   trigger={<Button>{t("orders.edit")}</Button>}
 *   footer={<Button onClick={save}>{t("common.save")}</Button>}
 *   isLoading={query.isPending}
 * >
 *   <OrderEditForm orderId={id} />
 * </Sheet>
 * ```
 */
export function Sheet({
    open,
    defaultOpen,
    onOpenChange,
    trigger,
    side = "end",
    title,
    description,
    children,
    footer,
    isLoading,
    hideCloseButton,
    contentClassName,
}: SheetProps) {
    const hasHeader = title !== undefined || description !== undefined;
    return (
        <SheetRoot open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
            {trigger !== undefined && <SheetTrigger render={trigger as never} />}
            <SheetContent side={side} hideCloseButton={hideCloseButton} className={contentClassName}>
                {hasHeader && (
                    <SheetHeader>
                        {title !== undefined && <SheetTitle>{title}</SheetTitle>}
                        {description !== undefined && <SheetDescription>{description}</SheetDescription>}
                    </SheetHeader>
                )}
                <SheetBody isLoading={isLoading}>{children}</SheetBody>
                {footer !== undefined && <SheetFooter>{footer}</SheetFooter>}
            </SheetContent>
        </SheetRoot>
    );
}
Sheet.displayName = "Sheet";

export type { SheetContentProps, SheetSideInput };
export { SheetBody, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetRoot, SheetTitle, SheetTrigger };
