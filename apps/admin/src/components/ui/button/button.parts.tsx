"use client";

import { Slot } from "@radix-ui/react-slot";
import { type ComponentProps, type ReactNode, useCallback, useState } from "react";

import { Spinner } from "#/components/ui/spinner";
import { cn } from "#/lib/utils";

import { type ButtonVariants, buttonVariants } from "./button.variants";

export interface ButtonRootProps extends Omit<ComponentProps<"button">, "disabled">, ButtonVariants {
    /** Render as the child element (Radix Slot). Use to compose with `<Link>`, `<a>`, etc. */
    asChild?: boolean;
    /**
     * Loading state. While true: keeps the rendered width (children stay in DOM but invisible so
     * the button doesn't collapse), overlays a centred {@link Spinner}, sets `aria-busy`, and
     * disables pointer events. Pair this with the async action the click triggers so the operator
     * gets immediate feedback without inventing a parent loading shell.
     */
    isLoading?: boolean;
    /** Disabled state — separated from `isLoading` so a parent can pass either independently. */
    disabled?: boolean;
}

/**
 * Canonical button primitive. Every clickable affordance in the admin renders through this — no
 * inline `<button>` tags in views. Use {@link ButtonVariants} for variant / tone / size; use
 * `isLoading` for async-action feedback (keeps width, doesn't shift layout); use `asChild` to
 * compose with `<Link>` or any other element while inheriting the styling + a11y attributes.
 */
export function ButtonRoot({
    className,
    variant,
    tone,
    size,
    asChild = false,
    isLoading = false,
    disabled = false,
    children,
    type,
    ...props
}: ButtonRootProps) {
    const Comp = asChild ? Slot : "button";
    const effectiveDisabled = disabled || isLoading;
    /**
     * Radix Slot requires exactly one React-element child. When `asChild` is true we therefore
     * pass `children` through unchanged — loading state is incompatible with `asChild` (you can't
     * overlay a spinner inside an arbitrary cloned element without breaking its layout) and is
     * silently ignored in that path. When `asChild` is false we wrap children + the spinner overlay
     * the way the original primitive did.
     */
    if (asChild) {
        return (
            <Comp
                data-slot="button"
                disabled={effectiveDisabled}
                aria-busy={isLoading || undefined}
                className={cn(buttonVariants({ variant, tone, size }), className)}
                {...props}
            >
                {children}
            </Comp>
        );
    }
    return (
        <Comp
            data-slot="button"
            type={type ?? "button"}
            disabled={effectiveDisabled}
            aria-busy={isLoading || undefined}
            className={cn(buttonVariants({ variant, tone, size }), isLoading && "relative", className)}
            {...props}
        >
            <span className={cn("contents", isLoading && "invisible")}>{children}</span>
            {isLoading && (
                <span className="absolute inset-0 inline-flex items-center justify-center" aria-hidden>
                    <Spinner className="size-4" />
                </span>
            )}
        </Comp>
    );
}
ButtonRoot.displayName = "ButtonRoot";

export interface IconButtonProps extends Omit<ButtonRootProps, "size"> {
    /** Required — `IconButton` has no visible label, so screen readers depend on this. */
    "aria-label": string;
    /** Rendered size. Defaults to `icon` (square 9 × 9). `sm` shrinks to 8 × 8 for dense rows. */
    size?: "icon" | "sm";
}

/**
 * Square button for icon-only affordances. Wraps {@link ButtonRoot} with `size="icon"`,
 * a required `aria-label`, and the `[&_svg]:size-4` rule preserved.
 */
export function IconButton({ size = "icon", "aria-label": ariaLabel, children, ...props }: IconButtonProps) {
    return (
        <ButtonRoot {...props} size={size === "sm" ? "sm" : "icon"} aria-label={ariaLabel} className={cn("p-0", props.className)}>
            {children}
        </ButtonRoot>
    );
}
IconButton.displayName = "IconButton";

export interface ToggleButtonProps extends Omit<ButtonRootProps, "asChild" | "type"> {
    /** Pressed state (controlled). Sets `aria-pressed` and the selected styling. */
    pressed?: boolean;
    /** Initial pressed state (uncontrolled). */
    defaultPressed?: boolean;
    /** Fired with the next pressed value when the user toggles. */
    onPressedChange?: (pressed: boolean) => void;
    children?: ReactNode;
}

/**
 * Single binary toggle button. Wraps {@link ButtonRoot} with `aria-pressed` and pressed-state
 * styling — used for inline "active / inactive" affordances (favourite, mute, pin, etc.). Built
 * on a plain `<button>` rather than a Base UI primitive because v1.4.1 doesn't expose Toggle,
 * and the surface here is simple enough that the extra dependency wouldn't earn its place.
 */
export function ToggleButton({
    pressed,
    defaultPressed,
    onPressedChange,
    onClick,
    className,
    variant = "outline",
    children,
    ...props
}: ToggleButtonProps) {
    const [uncontrolled, setUncontrolled] = useState(defaultPressed ?? false);
    const isControlled = pressed !== undefined;
    const effectivePressed = isControlled ? pressed : uncontrolled;

    const handleClick = useCallback(
        (event: React.MouseEvent<HTMLButtonElement>) => {
            onClick?.(event);
            if (event.defaultPrevented) return;
            const next = !effectivePressed;
            if (!isControlled) setUncontrolled(next);
            onPressedChange?.(next);
        },
        [effectivePressed, isControlled, onClick, onPressedChange],
    );

    return (
        <ButtonRoot
            {...props}
            variant={variant}
            aria-pressed={effectivePressed}
            data-state={effectivePressed ? "on" : "off"}
            className={cn(
                effectivePressed && "bg-accent text-accent-foreground data-[state=on]:border-accent-foreground/20",
                className,
            )}
            onClick={handleClick}
        >
            {children}
        </ButtonRoot>
    );
}
ToggleButton.displayName = "ToggleButton";
