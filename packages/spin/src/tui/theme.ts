import type { ServiceStatus } from "../core/snapshot-types";

/**
 * Meaning-named colors for the Ink TUI (Ink's `color` prop takes these names). Kept separate from
 * the web panel's CSS — same snapshot, different renderer.
 */
export const theme = {
    accent: "cyan",
    title: "whiteBright",
    muted: "gray",
    ok: "green",
    down: "red",
    warn: "yellow",
    selectedBg: "blueBright",
} as const;

/** Color for a service/tenant health status. */
export function healthColor(status: ServiceStatus): string {
    if (status === "up") return theme.ok;
    if (status === "down") return theme.down;
    return theme.warn;
}

/** A filled/empty dot glyph for a status (color applied by the caller via <Text color>). */
export function healthGlyph(status: ServiceStatus): string {
    return status === "unknown" ? "○" : "●";
}
