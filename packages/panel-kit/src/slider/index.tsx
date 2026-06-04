"use client";

import { cn } from "@calibra/shared";
import { Slider as SliderPrimitive } from "radix-ui";
import { type ComponentProps, useMemo } from "react";

export interface SliderProps extends ComponentProps<typeof SliderPrimitive.Root> {}

/**
 * Tier-2 slider primitive. Wraps Radix Slider (used here instead of Base UI because Radix's API
 * supports single + range thumbs out of the box). Thumb count is inferred from the value array
 * length — pass `value={[low, high]}` or `defaultValue={[low, high]}` for a range slider.
 */
export function Slider({ className, defaultValue, value, min = 0, max = 100, ...props }: SliderProps) {
    const values = useMemo(
        () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
        [value, defaultValue, min, max],
    );

    return (
        <SliderPrimitive.Root
            data-slot="slider"
            defaultValue={defaultValue}
            value={value}
            min={min}
            max={max}
            className={cn(
                "relative flex w-full touch-none select-none items-center",
                "data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
                "data-[disabled]:opacity-50",
                className,
            )}
            {...props}
        >
            <SliderPrimitive.Track
                data-slot="slider-track"
                className={cn(
                    "relative grow overflow-hidden rounded-full bg-muted",
                    "data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full",
                    "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5",
                )}
            >
                <SliderPrimitive.Range
                    data-slot="slider-range"
                    className={cn(
                        "absolute bg-primary",
                        "data-[orientation=horizontal]:h-full",
                        "data-[orientation=vertical]:w-full",
                    )}
                />
            </SliderPrimitive.Track>
            {values.map((thumbValue, index) => (
                <SliderPrimitive.Thumb
                    data-slot="slider-thumb"
                    key={`slider-thumb-${String(index)}-${String(thumbValue)}`}
                    className={cn(
                        "block size-4 shrink-0 rounded-full border border-primary bg-background shadow-sm ring-ring/50 transition-[color,box-shadow]",
                        "hover:ring-4 focus-visible:outline-hidden focus-visible:ring-4",
                        "disabled:pointer-events-none disabled:opacity-50",
                    )}
                />
            ))}
        </SliderPrimitive.Root>
    );
}
Slider.displayName = "Slider";
