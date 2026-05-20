import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type * as React from "react";

import { cn } from "#/lib/utils";

function Tabs({ className, ...props }: React.ComponentProps<typeof BaseTabs.Root>) {
    return <BaseTabs.Root data-slot="tabs" className={cn("flex flex-col gap-4", className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof BaseTabs.List>) {
    return (
        <BaseTabs.List
            data-slot="tabs-list"
            className={cn(
                "relative -mb-px inline-flex h-10 w-fit items-center gap-1 border-border border-b text-muted-foreground",
                className,
            )}
            {...props}
        />
    );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof BaseTabs.Tab>) {
    return (
        <BaseTabs.Tab
            data-slot="tabs-trigger"
            className={cn(
                "relative inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap px-3 font-medium text-sm outline-none transition-colors",
                /** 2px underline that sits flush on the parent's border-bottom. Linear-style. */
                "before:pointer-events-none before:absolute before:start-2 before:end-2 before:bottom-0 before:h-[2px] before:rounded-t-sm before:bg-foreground before:opacity-0 before:transition-opacity",
                "hover:text-foreground",
                "focus-visible:bg-accent",
                "disabled:pointer-events-none disabled:opacity-50",
                "data-[selected]:font-semibold data-[selected]:text-foreground data-[selected]:before:opacity-100",
                className,
            )}
            {...props}
        />
    );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof BaseTabs.Panel>) {
    return <BaseTabs.Panel data-slot="tabs-content" className={cn("flex-1 outline-none", className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
