/**
 * Browser-safe types for the panel. Re-exports the node-free snapshot contract so the client
 * imports its shapes from one place without reaching into core modules that touch node built-ins.
 * Everything here is type-only, so nothing leaks into the browser bundle.
 */
export type {
    RunSummary,
    SandboxSnapshot,
    ServiceRow,
    ServiceStatus,
    TenantRow,
} from "../core/snapshot-types";
