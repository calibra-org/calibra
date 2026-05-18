import { Menu } from "@base-ui/react/menu";
import type * as React from "react";

import { cn } from "#/lib/utils";

function DropdownMenu(props: React.ComponentProps<typeof Menu.Root>) {
    return <Menu.Root {...props} />;
}

function DropdownMenuTrigger(props: React.ComponentProps<typeof Menu.Trigger>) {
    return <Menu.Trigger {...props} />;
}

function DropdownMenuPortal(props: React.ComponentProps<typeof Menu.Portal>) {
    return <Menu.Portal {...props} />;
}

interface DropdownMenuContentProps extends React.ComponentProps<typeof Menu.Popup> {
    sideOffset?: number;
    align?: "start" | "end" | "center";
}

function DropdownMenuContent({ className, sideOffset = 6, align = "end", children, ...props }: DropdownMenuContentProps) {
    return (
        <Menu.Portal>
            <Menu.Positioner sideOffset={sideOffset} align={align} className="z-50">
                <Menu.Popup
                    data-slot="dropdown-menu-content"
                    className={cn(
                        "min-w-44 origin-[var(--transform-origin)] rounded-md border border-border bg-popover p-1 text-popover-foreground text-sm shadow-md outline-none",
                        "data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                        "transition-[opacity,transform] duration-150",
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

function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof Menu.Item>) {
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

/**
 * Section heading inside the dropdown. Rendered as a plain `<div>` rather than
 * `Menu.GroupLabel` because the latter requires a `<Menu.Group>` parent (Base UI throws
 * `MenuGroupRootContext is missing` otherwise). When you need a real a11y-grouped label, wrap
 * with {@link DropdownMenuGroup} and use `<Menu.GroupLabel>` directly inside it.
 */
function DropdownMenuLabel({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="dropdown-menu-label"
            className={cn("px-2.5 py-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide", className)}
            {...props}
        />
    );
}

function DropdownMenuSeparator({ className }: { className?: string }) {
    return <hr className={cn("my-1 h-px border-0 bg-border", className)} />;
}

function DropdownMenuGroup(props: React.ComponentProps<typeof Menu.Group>) {
    return <Menu.Group {...props} />;
}

export {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuPortal,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
};
