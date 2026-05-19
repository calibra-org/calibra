/**
 * Drop `null`, `undefined`, and empty-string header values, returning a fresh `Record<string, string>`.
 * Lets callers pass `authorization: token ? \`Bearer ${token}\` : undefined` without poisoning the request.
 */
export function sanitizeHeaders(input: Record<string, string | undefined | null> | undefined): Record<string, string> {
    if (input === undefined) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(input)) {
        if (typeof value === "string" && value.length > 0) {
            out[key] = value;
        }
    }
    return out;
}

/**
 * Best-effort JSON parser for response bodies. Returns `null` for empty payloads and the raw text
 * when parsing fails — never throws, so {@link BackendError} construction stays safe.
 */
export function parseJsonBody(text: string): unknown {
    if (text.length === 0) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}
