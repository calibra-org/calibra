import { cn } from "@calibra/shared";
import type { ComponentProps } from "react";

export interface TextareaProps extends ComponentProps<"textarea"> {}

/** Native `<textarea>` styled to match the admin's form-field language. */
export function Textarea({ className, ...props }: TextareaProps) {
    return (
        <textarea
            data-slot="textarea"
            className={cn(
                "flex min-h-20 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color]",
                "placeholder:text-muted-foreground/70",
                "hover:border-ring/40",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
                className,
            )}
            {...props}
        />
    );
}
Textarea.displayName = "Textarea";
