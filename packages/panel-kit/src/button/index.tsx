"use client";

import {
    ButtonRoot,
    type ButtonRootProps,
    IconButton,
    type IconButtonProps,
    ToggleButton,
    type ToggleButtonProps,
} from "./button.parts";
import { buttonVariants } from "./button.variants";

export type ButtonProps = ButtonRootProps;

/**
 * Convenience alias for {@link ButtonRoot}. Default API for every action in the admin:
 *
 * ```tsx
 * <Button variant="outline" tone="danger" isLoading={mutation.isPending} onClick={…}>
 *   {t("orders.cancel")}
 * </Button>
 * ```
 *
 * For polymorphic rendering (link, anchor, custom element) pass `asChild` and a single child:
 *
 * ```tsx
 * <Button asChild><Link href="/orders">{t("nav.orders")}</Link></Button>
 * ```
 */
export const Button = ButtonRoot;

export type { IconButtonProps, ToggleButtonProps };
export { ButtonRoot, buttonVariants, IconButton, ToggleButton };
