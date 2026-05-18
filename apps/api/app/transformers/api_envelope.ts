import app from "@adonisjs/core/services/app";
import type { Collection, Item, Paginator } from "@adonisjs/core/transformers";

/**
 * Pagination metadata shape the SDK expects (`Paginated<T>`). Different from Adonis' default
 * `metadata` envelope: we reshape so the SDK consumers don't have to change. Keep this in sync with
 * `packages/sdk/src/types.ts`.
 */
export interface PaginationMeta {
    page: number;
    perPage: number;
    total: number;
    lastPage: number;
}

export interface PaginatorLike {
    currentPage: number;
    perPage: number;
    total: number;
    lastPage: number;
}

export interface Paginated<T> {
    data: T[];
    meta: PaginationMeta;
}

export interface Resource<T> {
    data: T;
}

type Resolvable = Item<any, any, any> | Collection<any, any, any> | Paginator<any, any, any>;

async function resolveResource(resource: Resolvable): Promise<unknown> {
    const resolver = app.container.createResolver();
    return resource.resolve(resolver, 0, -1) as Promise<unknown>;
}

/** Wrap a single-resource transformer output in `{ data }`. */
export async function resource<T>(item: Item<any, any, any>): Promise<Resource<T>> {
    const data = (await resolveResource(item)) as T;
    return { data };
}

/** Wrap a collection of transformer outputs in `{ data: T[] }`. */
export async function collection<T>(coll: Collection<any, any, any>): Promise<{ data: T[] }> {
    const data = (await resolveResource(coll)) as T[];
    return { data };
}

/** Wrap a paginated transformer output in `{ data, meta }` matching the SDK envelope. */
export async function paginated<T>(coll: Collection<any, any, any>, paginator: PaginatorLike): Promise<Paginated<T>> {
    const data = (await resolveResource(coll)) as T[];
    return {
        data,
        meta: {
            page: paginator.currentPage,
            perPage: paginator.perPage,
            total: paginator.total,
            lastPage: paginator.lastPage,
        },
    };
}
