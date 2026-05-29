import type { ComponentProps, ReactNode } from "react";

import { Skeleton } from "#/components/ui/skeleton";
import { cn } from "#/lib/utils";

import {
    CardAction,
    CardBody,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardRoot,
    type CardRootProps,
    CardTitle,
    type CardTone,
} from "./card.parts";

export interface CardProps extends Omit<ComponentProps<"div">, "title"> {
    tone?: CardTone;
    title?: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    footer?: ReactNode;
    /** Body shows a `Skeleton` while true; header + footer keep rendering so the open frame doesn't flash. */
    isLoading?: boolean;
}

/**
 * Convenience wrapper for the common card shape (title + description + body + footer). Composes
 * the {@link CardRoot} / {@link CardHeader} / {@link CardBody} / {@link CardFooter} parts; reach
 * for the parts directly when you need a custom header layout.
 */
export function Card({ tone, title, description, action, footer, isLoading, className, children, ...props }: CardProps) {
    const hasHeader = title !== undefined || description !== undefined || action !== undefined;
    return (
        <CardRoot tone={tone} className={cn("gap-4 py-4", className)} {...props}>
            {hasHeader && (
                <CardHeader className="px-4 pb-3">
                    {title !== undefined && <CardTitle tone={tone}>{title}</CardTitle>}
                    {description !== undefined && <CardDescription>{description}</CardDescription>}
                    {action !== undefined && <CardAction>{action}</CardAction>}
                </CardHeader>
            )}
            <CardBody className={cn("px-4", isLoading && "space-y-2")}>
                {isLoading ? (
                    <>
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-4 w-2/3" />
                    </>
                ) : (
                    children
                )}
            </CardBody>
            {footer !== undefined && <CardFooter className="px-4">{footer}</CardFooter>}
        </CardRoot>
    );
}
Card.displayName = "Card";

export type { CardRootProps, CardTone };
export { CardAction, CardBody, CardContent, CardDescription, CardFooter, CardHeader, CardRoot, CardTitle };
