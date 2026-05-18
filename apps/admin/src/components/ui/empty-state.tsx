import type { ComponentType, ReactNode, SVGProps } from "react";

import { cn } from "#/lib/utils";

interface EmptyStateProps {
    icon?: ComponentType<SVGProps<SVGSVGElement>>;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div
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
