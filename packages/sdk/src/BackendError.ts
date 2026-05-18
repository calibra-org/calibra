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
        super(message ?? extractMessage(body));
        this.name = "BackendError";
        this.status = status;
        this.body = body;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function extractMessage(body: unknown): string {
    if (!isRecord(body)) return "Request failed";
    if (typeof body.message === "string" && body.message.length > 0) return body.message;
    if (typeof body.error === "string" && body.error.length > 0) return body.error;
    return "Request failed";
}
