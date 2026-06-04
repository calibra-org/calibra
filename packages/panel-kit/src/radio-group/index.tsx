"use client";

import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { cn } from "@calibra/shared";
import type { ComponentProps } from "react";

export interface RadioGroupProps extends ComponentProps<typeof BaseRadioGroup> {}

/** Container that owns the selection state for its child {@link Radio} buttons. */
export function RadioGroup({ className, ...props }: RadioGroupProps) {
    return <BaseRadioGroup data-slot="radio-group" className={cn("grid w-full gap-3", className)} {...props} />;
}
RadioGroup.displayName = "RadioGroup";

export interface RadioProps extends ComponentProps<typeof BaseRadio.Root> {}

/**
 * Single radio button. Uses Base UI's `Radio.Root` + `Indicator`. The inner dot is an 8px
 * primary-tinted circle that scales in/out via `transform-gpu` for a smooth check transition.
 * `keepMounted` on the indicator keeps the dot in the DOM so its scale animation can play.
 */
export function Radio({ className, children, ...props }: RadioProps) {
    return (
        <BaseRadio.Root
            data-slot="radio"
            className={cn(
                "group relative inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-foreground/30 bg-background outline-none transition-[color,box-shadow,background-color,border-color]",
                "hover:border-foreground/60",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                "data-[checked]:border-primary",
                /** Expanded touch / click target on top of the visual circle. */
                "after:absolute after:inset-[-6px] after:content-['']",
                "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20",
                className,
            )}
            {...props}
        >
            <BaseRadio.Indicator
                keepMounted
                data-slot="radio-indicator"
                className={cn(
                    "size-2 origin-center transform-gpu rounded-full bg-primary transition-transform duration-150 ease-out",
                    "data-[checked]:scale-100 data-[unchecked]:scale-0",
                )}
            />
            {children}
        </BaseRadio.Root>
    );
}
Radio.displayName = "Radio";

/**
 * Full-row radio "card". The entire surface is the `Radio.Root` control, so a click anywhere on the
 * row selects it (not just the 16px dot) and arrow keys move between cards — the accessible,
 * expected behaviour for a list of selectable options. The visual circle + indicator dot render at
 * the start; `children` fill the rest of the row.
 */
export function RadioCard({ className, children, ...props }: RadioProps) {
    return (
        <BaseRadio.Root
            data-slot="radio-card"
            className={cn(
                "group flex w-full cursor-pointer items-center gap-3 rounded-lg border bg-background px-3.5 py-3 text-start outline-none transition-[color,box-shadow,background-color,border-color]",
                "hover:bg-accent/40",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                "data-[checked]:border-primary data-[checked]:bg-primary/5",
                "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                className,
            )}
            {...props}
        >
            <span
                aria-hidden="true"
                className={cn(
                    "inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-foreground/30 transition-colors",
                    "group-hover:border-foreground/60 group-data-[checked]:border-primary",
                )}
            >
                <BaseRadio.Indicator
                    keepMounted
                    className="size-2 origin-center transform-gpu rounded-full bg-primary transition-transform duration-150 ease-out data-[checked]:scale-100 data-[unchecked]:scale-0"
                />
            </span>
            {children}
        </BaseRadio.Root>
    );
}
RadioCard.displayName = "RadioCard";
