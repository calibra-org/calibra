"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { cn } from "@calibra/shared";
import type { ComponentProps } from "react";

export interface SwitchProps extends ComponentProps<typeof BaseSwitch.Root> {}

/**
 * Tier-2 on/off switch. Wraps Base UI's `Switch.Root` + `Thumb`. The thumb translates 4 units
 * to the inline-end edge on `data-[checked]`; the rtl-aware override swaps the direction so
 * the thumb still ends up on the inline-end side under right-to-left text.
 */
export function Switch({ className, ...props }: SwitchProps) {
    return (
        <BaseSwitch.Root
            data-slot="switch"
            className={cn(
                "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "data-[checked]:bg-primary data-[unchecked]:bg-input",
                className,
            )}
            {...props}
        >
            <BaseSwitch.Thumb
                data-slot="switch-thumb"
                className={cn(
                    "pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                    "data-[checked]:translate-x-4 data-[unchecked]:translate-x-0 rtl:data-[checked]:-translate-x-4",
                )}
            />
        </BaseSwitch.Root>
    );
}
Switch.displayName = "Switch";
