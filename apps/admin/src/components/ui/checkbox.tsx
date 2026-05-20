import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import type * as React from "react";

import { cn } from "#/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof BaseCheckbox.Root>) {
    return (
        <BaseCheckbox.Root
            data-slot="checkbox"
            className={cn(
                /** Lock width AND height with explicit min/max so a flex parent can't squash the box to a thin sliver. */
                "peer inline-grid size-4 min-h-4 min-w-4 shrink-0 basis-4 place-items-center rounded-[4px] border border-foreground/30 bg-background shadow-xs outline-none transition-[color,box-shadow,background-color,border-color]",
                "hover:border-foreground/60",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground",
                "data-[indeterminate]:border-primary data-[indeterminate]:bg-primary data-[indeterminate]:text-primary-foreground",
                className,
            )}
            {...props}
        >
            <BaseCheckbox.Indicator className="grid place-items-center text-current">
                <Check className="size-3.5" aria-hidden="true" />
            </BaseCheckbox.Indicator>
        </BaseCheckbox.Root>
    );
}

export { Checkbox };
