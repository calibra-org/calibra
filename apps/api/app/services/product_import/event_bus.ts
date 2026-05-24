import transmit from "@adonisjs/transmit/services/main";

/**
 * Importer progress event contract. Broadcast goes out on the `imports/${importId}` channel via
 * `@adonisjs/transmit` — the browser opens the SSE connection through Transmit's first-party
 * `__transmit/events` route (authorized in `start/transmit.ts`) and receives every event we
 * publish here.
 *
 * The DB row (`product_imports`) remains the source of truth for counters + status; the SSE
 * feed is the accelerator that lets the wizard's progress UI feel instant.
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
 * Terminal event types end the run — the client stops listening once it sees one. Kept exported
 * for the (admin-side) UI to drive the "show success banner / rollback offer" branch off it.
 */
export const TERMINAL_EVENT_TYPES: ReadonlySet<ImportEventType> = new Set(["complete", "failed", "cancelled", "rolled_back"]);

/**
 * Publish an event to every subscriber of this import's Transmit channel. Subscribers may not
 * exist yet (the operator is still on Step 2) — that's fine; transmit silently drops broadcasts
 * with no listeners, and the DB row holds the counters that a late-joining client reads via
 * `GET /api/v1/admin/products/import/{id}` on its first paint.
 */
export function publishImportEvent(event: ImportEvent): void {
    /**
     * `Broadcastable` from `@boringnode/transmit/types` is a strict recursive value type; our
     * `ImportEvent` is structurally compatible (JSON-safe) but TS can't prove that without
     * importing a non-direct dep. `as never` keeps the strict tsconfig happy without pulling
     * `@boringnode/transmit` into `apps/api/package.json`.
     */
    transmit.broadcast(`imports/${event.importId}`, event as never);
}
