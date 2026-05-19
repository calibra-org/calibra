/**
 * Money amount in minor units (cents, rials, …). Always an integer.
 *
 * Semantic tag rather than a structural type — the generated schemas already model these as
 * `number`, this alias exists so consumers can document the intent at the call site.
 */
export type MoneyMinor = number;

/** Single-resource response envelope used by most non-list endpoints. */
export interface Resource<T> {
    data: T;
}

/**
 * Paginated list response envelope. Matches the `PaginationMeta` schema in the OpenAPI spec
 * (`page`, `perPage`, `total`, `lastPage`).
 */
export interface Paginated<T> {
    data: T[];
    meta: {
        page: number;
        perPage: number;
        total: number;
        lastPage: number;
    };
}

/**
 * Unwrap a `{ data: T }` envelope. Use after an openapi-fetch call when you only need the inner
 * resource (typical pattern for `GET /products/{slug}` and similar).
 */
export function unwrapResource<T>(envelope: Resource<T>): T {
    return envelope.data;
}

/**
 * Pluck the `data` array out of a paginated envelope, discarding `meta`. Use only when the
 * caller has no use for pagination — otherwise keep the full envelope and read both fields.
 */
export function unwrapPaginated<T>(envelope: Paginated<T>): T[] {
    return envelope.data;
}
