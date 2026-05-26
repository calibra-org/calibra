"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";

export interface HelperTooltipProps {
    /** Body of the tooltip / popover. Plain text or any inline-safe ReactNode. */
    children: ReactNode;
    /** Side hint passed to the underlying positioner. Defaults to "top". */
    side?: "top" | "right" | "bottom" | "left";
    /**
     * When provided, the trigger renders a click-pinnable Popover instead of a hover-only
     * Tooltip and the link is appended at the bottom of the popup. Used for fields where the
     * `why` is too rich to fit a one-liner.
     */
    learnMore?: { href: string; label: string };
    /** Adjusts the icon size; defaults to size-3.5. */
    iconClassName?: string;
    /** Extra classes on the trigger button (rarely needed). */
    className?: string;
}

/**
 * The "?" icon you see next to every WordPress form label, with our enhancement: the body is
 * always typed copy (not a `title` attribute), tooltip OR popover variants are pickable per call
 * site, and the trigger is a real keyboard-reachable button. Render inline-end of a `<Label>`
 * to add field-level help without stealing layout.
 *
 * ```tsx
 * <Label>SKU <HelperTooltip>Unique identifier used in inventory exports and POS lookups.</HelperTooltip></Label>
 * ```
 */
export function HelperTooltip({ children, side = "top", learnMore, iconClassName, className }: HelperTooltipProps) {
    void side;
    const t = useTranslations("Common");

    if (learnMore !== undefined) {
        return (
            <Popover>
                <PopoverTrigger
                    render={(props) => (
                        <button
                            type="button"
                            aria-label={t("moreInfo")}
                            {...props}
                            className={cn(
                                "ms-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                                className,
                            )}
                        >
                            <Info className={cn("size-3.5", iconClassName)} aria-hidden="true" />
                        </button>
                    )}
                />
                <PopoverContent side={side} className="max-w-[20rem] whitespace-normal text-xs leading-relaxed">
                    <div className="flex flex-col gap-2">
                        <div>{children}</div>
                        <a
                            href={learnMore.href}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="self-start text-primary underline-offset-2 hover:underline"
                        >
                            {learnMore.label}
                        </a>
                    </div>
                </PopoverContent>
            </Popover>
        );
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger
                    render={(props) => (
                        <button
                            type="button"
                            aria-label={t("moreInfo")}
                            {...props}
                            className={cn(
                                "ms-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                                className,
                            )}
                        >
                            <Info className={cn("size-3.5", iconClassName)} aria-hidden="true" />
                        </button>
                    )}
                />
                <TooltipContent className="max-w-[20rem] whitespace-normal leading-relaxed">
                    {children}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
