/**
 * Resolve the API base URL. Order:
 *
 * 1. Explicit `override` argument (good for tests).
 * 2. `process.env.NEXT_PUBLIC_API_BASE_URL`.
 * 3. `process.env.API_BASE_URL` (server-only fallback).
 * 4. Throws — the SDK refuses to silently default to a placeholder.
 */
export function getBaseUrl(override?: string): string {
    if (override !== undefined && override.length > 0) return override;
    const fromPublic = readEnv("NEXT_PUBLIC_API_BASE_URL");
    if (fromPublic !== undefined) return fromPublic;
    const fromServer = readEnv("API_BASE_URL");
    if (fromServer !== undefined) return fromServer;
    throw new Error(
        "getBaseUrl: no API base URL configured. Set NEXT_PUBLIC_API_BASE_URL (or API_BASE_URL on the server) or pass an explicit override.",
    );
}

function readEnv(key: string): string | undefined {
    const value = typeof process !== "undefined" ? process.env?.[key] : undefined;
    return typeof value === "string" && value.length > 0 ? value : undefined;
}
