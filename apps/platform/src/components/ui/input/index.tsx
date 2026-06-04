import type { ComponentProps } from "react";

import { cn } from "#/lib/utils";

export interface InputProps extends ComponentProps<"input"> {}

/**
 * Native `<input>` styled to match the admin's form-field language. `aria-invalid` flips the
 * border + focus ring to the destructive tone — pair with `<Field error=…>` in tier 3 for the
 * label + helper text bundle.
 */
export function Input({ className, type, ...props }: InputProps) {
    return (
        <input
            type={type}
            data-slot="input"
            className={cn(
                "flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow,border-color]",
                "selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground/70",
                "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm",
                "hover:border-ring/40",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
                "md:text-sm",
                className,
            )}
            {...props}
        />
    );
}
Input.displayName = "Input";
