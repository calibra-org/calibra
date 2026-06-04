"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

/**
 * Mounts the TanStack Query client for the authenticated console. Scoped to the `(authenticated)`
 * layout so the login route stays out of the React Query bundle. A 30s stale time keeps fleet data
 * fresh without hammering the API on every focus change.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
                    mutations: { retry: 0 },
                },
            }),
    );
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
