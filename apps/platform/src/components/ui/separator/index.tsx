import type { ComponentProps } from "react";

import { cn } from "#/lib/utils";

export interface SeparatorProps extends ComponentProps<"div"> {
    orientation?: "horizontal" | "vertical";
}

/**
 * Decorative-only divider. Renders as `role="none"` so it doesn't duplicate the page's existing
 * semantic structure. If a meaningful separator is needed in an a11y-sensitive flow, use a
 * semantic `<hr>` directly rather than extending this.
 */
export function Separator({ className, orientation = "horizontal", ...props }: SeparatorProps) {
    return (
        <div
            data-slot="separator"
            role="none"
            className={cn("shrink-0 bg-border", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)}
            {...props}
        />
    );
}
Separator.displayName = "Separator";
