"use client";

import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import type { ComponentProps } from "react";

import { cn } from "#/lib/utils";

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
