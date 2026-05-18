import type * as React from "react";

import { cn } from "#/lib/utils";

interface ProgressProps extends Omit<React.ComponentProps<"div">, "children"> {
    /** Percentage between 0 and 100. */
    value: number;
    /** Optional tone for the indicator bar. Defaults to `primary`. */
    tone?: "primary" | "success" | "warning" | "danger";
}

const toneClass: Record<Exclude<ProgressProps["tone"], undefined>, string> = {
    primary: "bg-primary",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
};

function Progress({ className, value, tone = "primary", ...props }: ProgressProps) {
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
            <div
                className={cn("h-full rounded-full transition-all duration-300", toneClass[tone])}
                style={{ width: `${clamped}%` }}
            />
        </div>
    );
}

export { Progress };
