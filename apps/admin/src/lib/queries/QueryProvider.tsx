"use client";

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider, removeOldestQuery } from "@tanstack/react-query-persist-client";
import { createStore, del, get, set } from "idb-keyval";
import { lazy, Suspense, useState } from "react";

const ReactQueryDevtools =
    process.env.NODE_ENV === "development"
        ? lazy(() => import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })))
        : null;

/**
 * 24-hour budget. Anything older than this is discarded on rehydrate, so a tab left open for days
 * never resurfaces stale dashboard numbers from yesterday.
 */
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Bumped whenever the persisted query shape changes (queryFn return type, queryKey schema). A
 * mismatch wipes the cache instead of trying to rehydrate stale entries into new types.
 */
const PERSIST_BUSTER = "v1";

const STORE_NAME = "calibra-admin-query-cache";
const STORE_KEY = "react-query-cache";

/**
 * Builds a QueryClient with admin-panel defaults:
 *
 * - `staleTime: 5 min` so dashboard widgets cache between navigations.
 * - `gcTime: 30 min` so a hot back-nav skips the network entirely.
 * - `retry: 1` (keeps the UI snappy when the API is down without spinning on every render).
 * - `refetchOnWindowFocus: true` (operators bouncing between admin and another tab want fresh
 *   numbers, not a stale snapshot).
 */
function buildClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 5 * 60 * 1000,
                gcTime: 30 * 60 * 1000,
                retry: 1,
                refetchOnWindowFocus: true,
            },
        },
    });
}

/**
 * idb-keyval storage adapter shaped like the Web Storage API the async-storage persister expects.
 * Lives in its own IDB database (`calibra-admin-query-cache`) so it doesn't collide with other
 * idb-keyval consumers and can be wiped wholesale via the browser's site-data UI.
 */
function buildPersister() {
    if (typeof window === "undefined") return undefined;
    const idbStore = createStore(STORE_NAME, "kv");
    return createAsyncStoragePersister({
        storage: {
            getItem: async (key) => {
                const value = await get(key, idbStore);
                return typeof value === "string" ? value : null;
            },
            setItem: (key, value) => set(key, value, idbStore),
            removeItem: (key) => del(key, idbStore),
        },
        key: STORE_KEY,
        throttleTime: 1000,
        /** Quietly evict the oldest query if the serialized cache grows past browser quotas. */
        retry: removeOldestQuery,
    });
}

/**
 * Restrict persistence to keys we know are safe to rehydrate. Any query rooted at one of these
 * tags survives full reloads; everything else stays in-memory only and refetches on next mount.
 */
const PERSIST_ROOTS = new Set(["dashboard"]);

/**
 * Holds the QueryClient for the authenticated admin tree. Created lazily inside `useState` so each
 * browser session gets exactly one client (React Strict Mode + Fast Refresh both call the render
 * twice but `useState`'s initializer only runs once per mount); SSR renders construct their own
 * one-shot client that is discarded immediately after streaming finishes.
 *
 * On the client, the cache is mirrored to IndexedDB so a full reload still paints the previous
 * dashboard snapshot before the network arrives — `staleTime` then drives the background refetch.
 *
 * @see {@link https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr}
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [client] = useState(buildClient);
    const [persister] = useState(buildPersister);

    const devtools =
        ReactQueryDevtools !== null ? (
            <Suspense fallback={null}>
                <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
            </Suspense>
        ) : null;

    if (persister === undefined) {
        return (
            <QueryClientProvider client={client}>
                {children}
                {devtools}
            </QueryClientProvider>
        );
    }

    return (
        <PersistQueryClientProvider
            client={client}
            persistOptions={{
                persister,
                maxAge: CACHE_MAX_AGE_MS,
                buster: PERSIST_BUSTER,
                dehydrateOptions: {
                    shouldDehydrateQuery: (query) => {
                        const root = query.queryKey[0];
                        return typeof root === "string" && PERSIST_ROOTS.has(root) && query.state.status === "success";
                    },
                },
            }}
        >
            {children}
            {devtools}
        </PersistQueryClientProvider>
    );
}
