import type * as React from "react";

import { cn } from "#/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
    return (
        // biome-ignore lint/a11y/noLabelWithoutControl: shadcn-style Label is a generic wrapper; callers pair it with a control via `htmlFor` (every consumer in this app does).
        <label
            data-slot="label"
            className={cn(
                "flex select-none items-center gap-2 font-medium text-sm leading-none",
                "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
                className,
            )}
            {...props}
        />
    );
}

export { Label };
