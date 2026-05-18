import type * as React from "react";

import { cn } from "#/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
    return (
        <label
            data-slot="label"
            className={cn(
                "flex items-center gap-2 font-medium text-sm leading-none select-none",
                "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
                className,
            )}
            {...props}
        />
    );
}

export { Label };
