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
                "relative inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
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
                "inline-flex h-7 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 font-medium text-sm outline-none transition-all",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "disabled:pointer-events-none disabled:opacity-50",
                "data-[selected]:bg-background data-[selected]:text-foreground data-[selected]:shadow-sm",
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
