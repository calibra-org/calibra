"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";

const ReactQueryDevtools =
    process.env.NODE_ENV === "development"
        ? lazy(() => import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })))
        : null;

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
 * Holds the QueryClient for the authenticated admin tree. Created lazily inside `useState` so each
 * browser session gets exactly one client (React Strict Mode + Fast Refresh both call the render
 * twice but `useState`'s initializer only runs once per mount); SSR renders construct their own
 * one-shot client that is discarded immediately after streaming finishes.
 *
 * @see {@link https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr}
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [client] = useState(buildClient);
    return (
        <QueryClientProvider client={client}>
            {children}
            {ReactQueryDevtools !== null ? (
                <Suspense fallback={null}>
                    <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
                </Suspense>
            ) : null}
        </QueryClientProvider>
    );
}
