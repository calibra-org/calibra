import type { ComponentProps } from "react";

import { cn } from "#/lib/utils";

export interface LabelProps extends ComponentProps<"label"> {
    /** Render a required marker (`*`) after the label text. */
    required?: boolean;
    /** Render an optional marker (translated by the caller) after the label text. */
    optional?: string;
}

/**
 * Form label. Always paired with a control via `htmlFor` (or by acting as the control's wrapper).
 * Adds optional `required` / `optional` markers so the caller doesn't reinvent the asterisk +
 * "(optional)" pattern per form.
 */
export function Label({ className, required, optional, children, ...props }: LabelProps) {
    return (
        // biome-ignore lint/a11y/noLabelWithoutControl: shadcn-style Label is a generic wrapper; consumers pair it with a control via `htmlFor`.
        <label
            data-slot="label"
            className={cn(
                "flex select-none items-center gap-2 font-medium text-sm leading-none",
                "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
                className,
            )}
            {...props}
        >
            {children}
            {required && (
                <span aria-hidden="true" className="text-danger">
                    *
                </span>
            )}
            {optional !== undefined && <span className="text-muted-foreground text-xs">({optional})</span>}
        </label>
    );
}
Label.displayName = "Label";
