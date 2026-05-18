import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose Tailwind class lists. `clsx` flattens conditional inputs and `tailwind-merge` resolves
 * variant conflicts (e.g. `p-2 p-4` → `p-4`). Use this in every component instead of string
 * concatenation.
 *
 * Shared across `apps/web` and `apps/admin` — keep the signature stable.
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}
