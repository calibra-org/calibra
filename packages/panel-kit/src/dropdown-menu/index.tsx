"use client";

import { Menu } from "@base-ui/react/menu";
import { cn } from "@calibra/shared";
import type { ComponentProps } from "react";

export function DropdownMenu(props: ComponentProps<typeof Menu.Root>) {
    return <Menu.Root {...props} />;
}
DropdownMenu.displayName = "DropdownMenu";

export function DropdownMenuTrigger(props: ComponentProps<typeof Menu.Trigger>) {
    return <Menu.Trigger {...props} />;
}
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

export function DropdownMenuPortal(props: ComponentProps<typeof Menu.Portal>) {
    return <Menu.Portal {...props} />;
}
DropdownMenuPortal.displayName = "DropdownMenuPortal";

export interface DropdownMenuContentProps extends ComponentProps<typeof Menu.Popup> {
    sideOffset?: number;
    align?: "start" | "end" | "center";
}

export function DropdownMenuContent({ className, sideOffset = 6, align = "end", children, ...props }: DropdownMenuContentProps) {
    return (
        <Menu.Portal>
            <Menu.Positioner sideOffset={sideOffset} align={align} className="z-50">
                <Menu.Popup
                    data-slot="dropdown-menu-content"
                    className={cn(
                        "min-w-44 origin-[var(--transform-origin)] rounded-md border border-border bg-popover p-1 text-popover-foreground text-sm shadow-md outline-none",
                        "data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                        "transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none",
                        className,
                    )}
                    {...props}
                >
                    {children}
                </Menu.Popup>
            </Menu.Positioner>
        </Menu.Portal>
    );
}
DropdownMenuContent.displayName = "DropdownMenuContent";

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
    return (
        <Menu.Item
            data-slot="dropdown-menu-item"
            className={cn(
                "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-1.5 outline-none",
                "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                className,
            )}
            {...props}
        />
    );
}
DropdownMenuItem.displayName = "DropdownMenuItem";

/**
 * Section heading inside the dropdown. Rendered as a plain `<div>` because `Menu.GroupLabel`
 * requires a `<Menu.Group>` parent (Base UI throws `MenuGroupRootContext is missing` otherwise).
 * Wrap with {@link DropdownMenuGroup} + use `<Menu.GroupLabel>` directly when you need an
 * a11y-grouped label.
 */
export function DropdownMenuLabel({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="dropdown-menu-label"
            className={cn("px-2.5 py-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide", className)}
            {...props}
        />
    );
}
DropdownMenuLabel.displayName = "DropdownMenuLabel";

export function DropdownMenuSeparator({ className }: { className?: string }) {
    return <hr className={cn("my-1 h-px border-0 bg-border", className)} />;
}
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export function DropdownMenuGroup(props: ComponentProps<typeof Menu.Group>) {
    return <Menu.Group {...props} />;
}
DropdownMenuGroup.displayName = "DropdownMenuGroup";
