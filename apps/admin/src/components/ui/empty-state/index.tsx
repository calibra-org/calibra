import type { ComponentType, ReactNode, SVGProps } from "react";

import { cn } from "#/lib/utils";

export interface EmptyStateProps {
    icon?: ComponentType<SVGProps<SVGSVGElement>>;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
}

/**
 * Tier-3 empty-state primitive. Use as the "settled with zero rows" body for list / grid / picker
 * surfaces. Pair with `EmptyState` for the "no results, change your filters" variant inside
 * `DataGrid`, picker popups, etc.
 *
 * `icon` should come from `#/icons` — passing the raw lucide import works but bypasses the
 * centralised icon module's RTL handling.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div
            data-slot="empty-state"
            className={cn(
                "flex flex-col items-center gap-3 rounded-lg border border-border border-dashed bg-card p-12 text-center",
                className,
            )}
        >
            {Icon !== undefined && (
                <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
                    <Icon className="size-5" aria-hidden="true" />
                </div>
            )}
            <div className="flex flex-col gap-1">
                <div className="font-medium">{title}</div>
                {description !== undefined && <div className="text-muted-foreground text-sm">{description}</div>}
            </div>
            {action !== undefined && <div className="mt-2">{action}</div>}
        </div>
    );
}
EmptyState.displayName = "EmptyState";
