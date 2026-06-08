/**
 * Browser-safe types shared between the panel server and client. This module must never
 * import node built-ins, so it can be pulled into the browser bundle without leaking
 * `node:net` / `node:child_process` into the client graph. Phase 5 re-exports the full
 * snapshot contract through here; Phase 0 only needs the status payload.
 */

/** Payload returned by `GET /api/status`. */
export interface StatusPayload {
    /** The sandbox slug this panel was launched for. */
    slug: string;
    /** Liveness flag — the server is up and answering. */
    ok: boolean;
    /** Coarse lifecycle phase. Replaced by the full snapshot in Phase 5. */
    phase: string;
    /** The `@calibra/spin` package version serving this panel. */
    version: string;
}
