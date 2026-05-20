import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import type * as React from "react";

import { cn } from "#/lib/utils";

function Select(props: React.ComponentProps<typeof BaseSelect.Root>) {
    return <BaseSelect.Root {...props} />;
}

function SelectValue(props: React.ComponentProps<typeof BaseSelect.Value>) {
    return <BaseSelect.Value {...props} />;
}

function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof BaseSelect.Trigger>) {
    return (
        <BaseSelect.Trigger
            data-slot="select-trigger"
            className={cn(
                "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow]",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "data-[popup-open]:border-ring",
                className,
            )}
            {...props}
        >
            {children}
            <BaseSelect.Icon>
                <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
            </BaseSelect.Icon>
        </BaseSelect.Trigger>
    );
}

function SelectContent({ className, children, ...props }: React.ComponentProps<typeof BaseSelect.Popup>) {
    return (
        <BaseSelect.Portal>
            <BaseSelect.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-50">
                <BaseSelect.Popup
                    data-slot="select-content"
                    className={cn(
                        "max-h-80 min-w-[--anchor-width] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none",
                        "data-[ending-style]:translate-y-1 data-[starting-style]:translate-y-1 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                        "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
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

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof BaseSelect.Item>) {
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
            <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
        </BaseSelect.Item>
    );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
