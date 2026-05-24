import { EventEmitter } from "node:events";

/**
 * In-process progress bus for active import jobs. Per the spec point 17 we prefer SSE over
 * polling — the SSE controller subscribes to this bus and pipes events to the open response, so
 * the storefront feels instant. Polling fallback still hits `GET .../status`, which reads the DB
 * row instead. The DB row is the source of truth; the bus is just an accelerator.
 *
 * No external broker (Redis / RabbitMQ): a single-process AdonisJS deployment is the current
 * shape. If we ever go multi-process the bus becomes a per-instance cache that publishes through
 * `pg_notify` — see the worker service when that happens.
 */

export type ImportEventType =
    | "progress"
    | "chunk_start"
    | "chunk_complete"
    | "slow_chunk"
    | "warning"
    | "error"
    | "complete"
    | "failed"
    | "cancelled"
    | "rolled_back";

export interface ImportEvent {
    type: ImportEventType;
    importId: number;
    /** Wall-clock timestamp in ISO-8601 for client ordering when the SSE stream reconnects. */
    at: string;
    /** Free-form per-event payload. Wire shape is per-event-type so the client narrows on `type`. */
    payload?: Record<string, unknown>;
}

/**
 * `terminal` events end the SSE stream — controller closes the response right after emitting.
 * Keep this set in sync with the runner's exit paths.
 */
export const TERMINAL_EVENT_TYPES: ReadonlySet<ImportEventType> = new Set([
    "complete",
    "failed",
    "cancelled",
    "rolled_back",
]);

const buses = new Map<number, EventEmitter>();

function getBus(importId: number): EventEmitter {
    let bus = buses.get(importId);
    if (bus === undefined) {
        bus = new EventEmitter();
        bus.setMaxListeners(20);
        buses.set(importId, bus);
    }
    return bus;
}

/**
 * Publish an event to every subscriber of this import id. Subscribers may not exist yet (the
 * operator is still on Step 2) — that's fine; the runner publishes regardless and the DB row
 * holds the counters that a late-joining SSE / polling client reads on first frame.
 */
export function publishImportEvent(event: ImportEvent): void {
    const bus = getBus(event.importId);
    bus.emit("event", event);
    if (TERMINAL_EVENT_TYPES.has(event.type)) {
        /** Drop the bus once the job is done so memory doesn't grow with completed-job history. */
        setTimeout(() => {
            buses.delete(event.importId);
        }, 30_000).unref();
    }
}

/**
 * Subscribe to events for one import. Returns an unsubscriber the caller must invoke on
 * disconnect / connection close — otherwise listeners pile up.
 */
export function subscribeToImport(
    importId: number,
    listener: (event: ImportEvent) => void,
): () => void {
    const bus = getBus(importId);
    bus.on("event", listener);
    return () => {
        bus.off("event", listener);
    };
}
