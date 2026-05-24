import { Loader2 } from "lucide-react";

import { cn } from "#/lib/utils";

/**
 * Tiny inline loading indicator. Slot-shaped so it can live inside a {@link Button} without
 * fighting the icon-spacing rules baked into the button variants.
 */
export function Spinner({ className }: { className?: string }): React.JSX.Element {
    return <Loader2 className={cn("size-4 animate-spin", className)} aria-hidden />;
}
