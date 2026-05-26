import type { ComponentProps } from "react";

import { cn } from "#/lib/utils";

import { type ProgressIndicatorVariants, progressIndicator } from "./progress.variants";

export interface ProgressProps extends Omit<ComponentProps<"div">, "children"> {
    /** Percentage between 0 and 100. */
    value: number;
    /** Indicator tone — defaults to `primary`. Semantic tones available: success / warning / danger / info. */
    tone?: ProgressIndicatorVariants["tone"];
}

/**
 * Determinate progress bar. ARIA `progressbar` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax`.
 * For indeterminate / spinner-style loading use `<Spinner />` instead.
 */
export function Progress({ className, value, tone = "primary", ...props }: ProgressProps) {
    const clamped = Math.max(0, Math.min(100, value));
    return (
        <div
            data-slot="progress"
            role="progressbar"
            aria-valuenow={clamped}
            aria-valuemin={0}
            aria-valuemax={100}
            className={cn("h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)}
            {...props}
        >
            <div className={progressIndicator({ tone })} style={{ width: `${clamped}%` }} />
        </div>
    );
}
Progress.displayName = "Progress";
