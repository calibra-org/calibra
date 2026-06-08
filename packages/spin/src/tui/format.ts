/** Small formatting helpers for the TUI's fixed-width rows. */

/** Pad/truncate a string to exactly `width` columns. */
export function cell(value: string, width: number): string {
    if (value.length === width) return value;
    if (value.length < width) return value.padEnd(width);
    return width <= 1 ? value.slice(0, width) : `${value.slice(0, width - 1)}…`;
}

/** Compact "Ns/Nm/Nh ago" from an ISO timestamp. */
export function relativeTime(iso: string, now: number): string {
    const delta = Math.max(0, now - Date.parse(iso));
    const seconds = Math.floor(delta / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}
