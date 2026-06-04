import type { ComponentProps } from "react";

import { card } from "./card.variants";

export type CardTone = "default" | "success" | "warning" | "danger" | "info";

export interface CardRootProps extends ComponentProps<"div"> {
    tone?: CardTone;
}

/** Outer card frame. Pass `tone` for tone-coloured border + title. */
export function CardRoot({ tone = "default", className, ...props }: CardRootProps) {
    return <div data-slot="card-root" className={card({ tone }).root({ class: className })} {...props} />;
}
CardRoot.displayName = "CardRoot";

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="card-header" className={card().header({ class: className })} {...props} />;
}
CardHeader.displayName = "CardHeader";

/** Card title — heading slot inside `CardHeader`. */
export function CardTitle({ tone = "default", className, ...props }: ComponentProps<"div"> & { tone?: CardTone }) {
    return <div data-slot="card-title" className={card({ tone }).title({ class: className })} {...props} />;
}
CardTitle.displayName = "CardTitle";

export function CardDescription({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="card-description" className={card().description({ class: className })} {...props} />;
}
CardDescription.displayName = "CardDescription";

/** Optional action slot inside `CardHeader` (top-end aligned). */
export function CardAction({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="card-action" className={card().action({ class: className })} {...props} />;
}
CardAction.displayName = "CardAction";

export function CardBody({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="card-body" className={card().body({ class: className })} {...props} />;
}
CardBody.displayName = "CardBody";

/** Alias for {@link CardBody} kept for shadcn-compat call sites that used `CardContent`. */
export const CardContent = CardBody;

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="card-footer" className={card().footer({ class: className })} {...props} />;
}
CardFooter.displayName = "CardFooter";
