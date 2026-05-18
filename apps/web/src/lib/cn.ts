import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose Tailwind class lists. `clsx` flattens conditional inputs and `tailwind-merge` resolves
 * the conflicts that arise from variant overrides (e.g. `p-2 p-4` → `p-4`). Use this in every
 * component instead of string concatenation.
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}
