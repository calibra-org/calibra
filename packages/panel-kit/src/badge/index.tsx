import { cn } from "@calibra/shared";
import { Slot } from "@radix-ui/react-slot";
import type { ComponentProps } from "react";

import { type BadgeVariants, badgeVariants } from "./badge.variants";

export interface BadgeProps extends ComponentProps<"span">, BadgeVariants {
    /** Render as the child element (Radix Slot). Use to wrap a link / button while preserving badge styling. */
    asChild?: boolean;
}

/**
 * Status / label pill. Tier-2 primitive used for tags, counts, status indicators, and inline
 * annotations. Tier-4 wrappers like `OrderStatusBadge` / `CouponStatusBadge` map a domain enum
 * to `tone` so the same visual language is reused across resources.
 *
 * `dot` swaps the badge for a compact "● label" pill — used in status columns where the dot
 * carries the tone and the label reads as plain text.
 */
export function Badge({ className, variant, tone, dot, asChild = false, children, ...props }: BadgeProps) {
    const Comp = asChild ? Slot : "span";
    const resolvedTone = tone ?? "default";
    return (
        <Comp data-slot="badge" className={cn(badgeVariants({ variant, tone, dot }), className)} {...props}>
            {dot && (
                <span
                    data-slot="badge-dot"
                    aria-hidden
                    className={cn("inline-block size-1.5 rounded-full", DOT_BG_BY_TONE[resolvedTone])}
                />
            )}
            {children}
        </Comp>
    );
}
Badge.displayName = "Badge";

const DOT_BG_BY_TONE: Record<NonNullable<BadgeVariants["tone"]>, string> = {
    default: "bg-current",
    info: "bg-info",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
};

export { badgeVariants };
