import type { ComponentProps } from "react";

import { Spinner as SpinnerIcon } from "#/icons";

import { type SpinnerVariants, spinnerVariants } from "./spinner.variants";

export interface SpinnerProps extends Omit<ComponentProps<"svg">, "size">, SpinnerVariants {}

/**
 * Inline loading indicator. Tier-2 primitive used as the loading-state affordance for every other
 * primitive (Button isLoading, Combobox search-in-flight, Toast loading, Pagination fetching,
 * Dialog body skeleton, …). Honours `prefers-reduced-motion`.
 */
export function Spinner({ size, className, ...props }: SpinnerProps) {
    return <SpinnerIcon data-slot="spinner" aria-hidden className={spinnerVariants({ size, class: className })} {...props} />;
}
Spinner.displayName = "Spinner";
