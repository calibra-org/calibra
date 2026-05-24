import { EventEmitter } from "node:events";

/**
 * Parallel in-process progress bus for the product exporter — same pattern as the importer's
 * bus, with its own event-type union so TS narrows correctly on each side. Single-process
 * AdonisJS deployment, so no broker; if we ever go multi-process the bus becomes a per-instance
 * cache and `pg_notify` carries cross-process events.
 *
 * The DB row (`product_exports`) is the source of truth for counters + status; the bus is just
 * the accelerator that lets the SSE stream feel instant.
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

const buses = new Map<number, EventEmitter>();

function getBus(exportId: number): EventEmitter {
    let bus = buses.get(exportId);
    if (bus === undefined) {
        bus = new EventEmitter();
        bus.setMaxListeners(20);
        buses.set(exportId, bus);
    }
    return bus;
}

/** Publish an event to every subscriber of this export id. Drops terminal buses after 30s. */
export function publishExportEvent(event: ExportEvent): void {
    const bus = getBus(event.exportId);
    bus.emit("event", event);
    if (TERMINAL_EXPORT_EVENT_TYPES.has(event.type)) {
        setTimeout(() => {
            buses.delete(event.exportId);
        }, 30_000).unref();
    }
}

/** Subscribe to events for one export. Returns the unsubscriber the SSE handler must call on close. */
export function subscribeToExport(exportId: number, listener: (event: ExportEvent) => void): () => void {
    const bus = getBus(exportId);
    bus.on("event", listener);
    return () => {
        bus.off("event", listener);
    };
}
