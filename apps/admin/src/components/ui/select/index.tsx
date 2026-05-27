"use client";

import { Select as BaseSelect } from "@base-ui/react/select";
import type { ComponentProps } from "react";

import { Check, ChevronsUpDown, Spinner } from "#/icons";
import { cn } from "#/lib/utils";

export function Select(props: ComponentProps<typeof BaseSelect.Root>) {
    return <BaseSelect.Root {...props} />;
}
Select.displayName = "Select";

export function SelectValue(props: ComponentProps<typeof BaseSelect.Value>) {
    return <BaseSelect.Value {...props} />;
}
SelectValue.displayName = "SelectValue";

export interface SelectTriggerProps extends ComponentProps<typeof BaseSelect.Trigger> {
    /** Render an inline `<Spinner />` instead of the chevron — set while the parent is fetching options. */
    loading?: boolean;
}

export function SelectTrigger({ className, children, loading, ...props }: SelectTriggerProps) {
    return (
        <BaseSelect.Trigger
            data-slot="select-trigger"
            className={cn(
                "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color]",
                "hover:border-ring/40",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                "data-[popup-open]:border-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
                className,
            )}
            {...props}
        >
            {children}
            <BaseSelect.Icon>
                {loading === true ? (
                    <Spinner size="sm" className="text-muted-foreground" />
                ) : (
                    <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
                )}
            </BaseSelect.Icon>
        </BaseSelect.Trigger>
    );
}
SelectTrigger.displayName = "SelectTrigger";

export function SelectContent({ className, children, ...props }: ComponentProps<typeof BaseSelect.Popup>) {
    return (
        <BaseSelect.Portal>
            <BaseSelect.Positioner
                sideOffset={6}
                alignItemWithTrigger={false}
                align="start"
                className="z-50"
            >
                {/**
                 * Popup is sized to match the trigger:
                 *   - `w-(--anchor-width)` pins width to the trigger's measured width so the
                 *     popup never appears narrower (or wider) than the surface it anchors to.
                 *   - `max-w-[min(calc(100vw-1rem),24rem)]` caps the absolute width on tiny
                 *     viewports so an oversized trigger doesn't spill off-screen.
                 *
                 * The previous `min-w-[--anchor-width]` was invalid Tailwind v4 syntax (missing
                 * the `var()` wrapper / the parentheses shorthand), so the popup defaulted to
                 * its intrinsic content width and looked detached from the trigger.
                 */}
                <BaseSelect.Popup
                    data-slot="select-content"
                    className={cn(
                        "max-h-80 w-(--anchor-width) max-w-[min(calc(100vw-1rem),24rem)] origin-[var(--transform-origin)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none",
                        "data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                        "transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none",
                        className,
                    )}
                    {...props}
                >
                    {children}
                </BaseSelect.Popup>
            </BaseSelect.Positioner>
        </BaseSelect.Portal>
    );
}
SelectContent.displayName = "SelectContent";

export function SelectItem({ className, children, ...props }: ComponentProps<typeof BaseSelect.Item>) {
    return (
        <BaseSelect.Item
            data-slot="select-item"
            className={cn(
                "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 ps-8 pe-2 text-sm outline-none",
                "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                className,
            )}
            {...props}
        >
            <span className="absolute start-2 flex size-3.5 items-center justify-center">
                <BaseSelect.ItemIndicator>
                    <Check className="size-3.5" aria-hidden="true" />
                </BaseSelect.ItemIndicator>
            </span>
            {/** Single-line item text — long values ellipsis-truncate instead of pushing the popup wider than the trigger anchor. */}
            <BaseSelect.ItemText className="min-w-0 flex-1 truncate">{children}</BaseSelect.ItemText>
        </BaseSelect.Item>
    );
}
SelectItem.displayName = "SelectItem";
