import { cn } from "#/lib/utils";

/** How a taxonomy inspector paints its outer surface. */
export type InspectorVariant = "card" | "plain";

/**
 * Outer-surface classes for a taxonomy inspector `<form>`. `card` (default) is the standalone
 * panel used in the management-page aside; `plain` drops the border / shadow / background / padding
 * for hosts that already supply the chrome — notably the taxonomy detail sheet, whose
 * `SheetContent` is itself the panel. Centralising this keeps brand / category / tag inspectors
 * visually identical across both surfaces and avoids a card-inside-a-sheet double border.
 */
export function inspectorFormClassName(variant: InspectorVariant = "card"): string {
    return cn("flex h-full flex-col gap-5", variant === "card" && "rounded-2xl border border-border/60 bg-card p-5 shadow-sm");
}
