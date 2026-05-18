/**
 * Public domain types exposed by the Calibra commerce API.
 *
 * Mirror the response shapes in `apps/api/app/controllers/*.ts`. When the API adds a field, add it
 * here and bump the SDK consumers — types are the contract.
 */

/** Money amount in minor units (cents, rials, …). Always an integer. */
export type MoneyMinor = number;

export interface Product {
    id: number;
    slug: string;
    name: string;
    description: string;
    priceCents: MoneyMinor;
    /** ISO 4217 currency code, e.g. `"USD"`, `"IRR"`. */
    currency: string;
    /** `null` when stock is untracked (digital goods, services). */
    stockQuantity: number | null;
    imageUrl: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CartLine {
    /** Stable identifier for the line, used to update or remove it without resending the product. */
    key: string;
    productId: number;
    quantity: number;
    unitPriceCents: MoneyMinor;
    lineTotalCents: MoneyMinor;
}

export interface Cart {
    id: string;
    currency: string;
    lines: CartLine[];
    subtotalCents: MoneyMinor;
    taxCents: MoneyMinor;
    totalCents: MoneyMinor;
}

/**
 * Paginated list response. Matches the envelope returned by `ProductsController#index` —
 * `{ data, meta }` with cursor-free page numbers.
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

/** Single-resource response envelope. */
export interface Resource<T> {
    data: T;
}
