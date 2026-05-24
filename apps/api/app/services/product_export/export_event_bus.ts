import transmit from "@adonisjs/transmit/services/main";

/**
 * Exporter progress event contract. Mirrors the importer's `event_bus.ts` — broadcast goes out
 * on the `exports/${exportId}` channel via `@adonisjs/transmit`, authorized in
 * `start/transmit.ts`. The DB row (`product_exports`) is the source of truth for counters; SSE
 * is the accelerator.
 */

export type ExportEventType =
    | "reading_products"
    | "chunk_start"
    | "chunk_complete"
    | "slow_chunk"
    | "compressing"
    | "complete"
    | "failed"
    | "cancelled";

export interface ExportEvent {
    type: ExportEventType;
    exportId: number;
    /** ISO-8601 wall clock — lets the SSE client order events when reconnecting mid-run. */
    at: string;
    payload?: Record<string, unknown>;
}

export const TERMINAL_EXPORT_EVENT_TYPES: ReadonlySet<ExportEventType> = new Set(["complete", "failed", "cancelled"]);

/** Publish an event to every subscriber of this export's Transmit channel. */
export function publishExportEvent(event: ExportEvent): void {
    /** See `product_import/event_bus.ts` for the `as never` rationale. */
    transmit.broadcast(`exports/${event.exportId}`, event as never);
}
