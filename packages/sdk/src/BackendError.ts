/**
 * Error thrown by {@link HttpClient} when a request returns a non-2xx response or fails at the
 * transport layer (network error, abort, JSON parse failure).
 *
 * The `message` is resolved through a fallback chain so callers always get something human-readable:
 * `body.message` → `body.error` → `statusText` → `"Request failed"`.
 */
export class BackendError extends Error {
    readonly status: number;
    readonly body: unknown;

    constructor(status: number, body: unknown, message?: string) {
        const resolved =
            message ??
            (isRecord(body) && typeof body.message === "string" && body.message) ||
            (isRecord(body) && typeof body.error === "string" && body.error) ||
            "Request failed";
        super(typeof resolved === "string" ? resolved : "Request failed");
        this.name = "BackendError";
        this.status = status;
        this.body = body;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
