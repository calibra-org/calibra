"use client";

import { Inbox, SearchX } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";

interface DataTableEmptyProps {
    variant: "empty" | "filtered";
    title: ReactNode;
    description?: ReactNode;
    primaryAction?: { label: ReactNode; onClick: () => void };
    secondaryAction?: { label: ReactNode; onClick: () => void };
}

/**
 * Two-variant empty state. `empty` is the first-time-no-data view (illustration + create CTA);
 * `filtered` reads as "no matches for these filters" with a clear-filters affordance. They are
 * deliberately distinct to avoid the WooCommerce "you have no products" surface that hides under
 * an active filter.
 */
export function DataTableEmpty({ variant, title, description, primaryAction, secondaryAction }: DataTableEmptyProps) {
    const Icon = variant === "empty" ? Inbox : SearchX;
    return (
        <div className="flex w-full flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-5" aria-hidden="true" />
            </div>
            <div className="flex max-w-md flex-col items-center gap-1.5">
                <p className="text-center font-medium text-foreground">{title}</p>
                {description !== undefined && (
                    <p className="text-center text-muted-foreground text-sm">{description}</p>
                )}
            </div>
            {(primaryAction !== undefined || secondaryAction !== undefined) && (
                <div className="mt-1 flex items-center gap-2">
                    {primaryAction !== undefined && <Button onClick={primaryAction.onClick}>{primaryAction.label}</Button>}
                    {secondaryAction !== undefined && (
                        <Button variant="ghost" onClick={secondaryAction.onClick}>
                            {secondaryAction.label}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
