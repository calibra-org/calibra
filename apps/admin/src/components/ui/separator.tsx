import type * as React from "react";

import { cn } from "#/lib/utils";

interface SeparatorProps extends React.ComponentProps<"div"> {
    orientation?: "horizontal" | "vertical";
}

/**
 * Decorative-only divider. Renders as a hidden-from-AT `role="none"` element to avoid duplicating
 * the page's existing semantic structure (headings, landmarks). If a meaningful separator is ever
 * needed in an a11y-sensitive flow, use a semantic `<hr>` directly rather than extending this.
 */
function Separator({ className, orientation = "horizontal", ...props }: SeparatorProps) {
    return (
        <div
            data-slot="separator"
            role="none"
            className={cn("shrink-0 bg-border", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)}
            {...props}
        />
    );
}

export { Separator };
