"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { toAdminOrderDetail } from "#/lib/adapters/orders";
import { apiGet, apiMutate } from "#/lib/queries/api-client";
import type { AdminOrder, OrderStatus } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];

interface OrderEnvelope {
    data: Schemas["AdminOrderDetail"];
}

/**
 * Single order detail. Keyed by `id` only — locale lives in the query key so a language flip
 * refetches the localized payload, but the actual data shape doesn't depend on it.
 *
 * `enabled: id > 0` guards against rendering a hook before the route param resolves; this keeps
 * the empty-state path in the page component simple.
 */
export function useOrder(id: number) {
    const locale = useLocale() as Locale;
    return useQuery<OrderEnvelope, Error, AdminOrder>({
        queryKey: ["admin", "orders", "detail", id, { locale }],
        queryFn: () => apiGet<OrderEnvelope>(`orders/${id}`, { locale }),
        select: (payload) => toAdminOrderDetail(payload.data),
        enabled: id > 0,
    });
}

export interface OrderStatusTransitionInput {
    id: number;
    to_status: OrderStatus;
    reason?: string;
}

/**
 * Posts `/api/v1/admin/orders/{id}/status` through the proxy. The optimistic-update wrapper lives
 * in the order-detail view and pivots on this mutation via React Query's onMutate / onError / onSettled.
 */
export function useUpdateOrderStatus() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();

    return useMutation<OrderEnvelope, Error, OrderStatusTransitionInput, { previous?: OrderEnvelope }>({
        mutationFn: ({ id, to_status, reason }) =>
            apiMutate<OrderEnvelope>("POST", `orders/${id}/status`, {
                locale,
                body: reason !== undefined ? { to_status, reason } : { to_status },
            }),
        /**
         * Snapshot the current order envelope, optimistically patch the visible status, and stash
         * the snapshot for rollback. Note we patch the raw envelope (`data.status`) because the
         * query's `select` runs `toAdminOrderDetail` again every render.
         */
        onMutate: async ({ id, to_status }) => {
            const detailKeyMatch = { queryKey: ["admin", "orders", "detail", id] };
            await queryClient.cancelQueries(detailKeyMatch);
            const previous = queryClient.getQueryData<OrderEnvelope>(["admin", "orders", "detail", id, { locale }]);
            if (previous) {
                queryClient.setQueryData<OrderEnvelope>(["admin", "orders", "detail", id, { locale }], {
                    ...previous,
                    data: { ...previous.data, status: to_status as Schemas["AdminOrderDetail"]["status"] },
                });
            }
            return { previous };
        },
        onError: (_err, { id }, context) => {
            if (context?.previous) {
                queryClient.setQueryData(["admin", "orders", "detail", id, { locale }], context.previous);
            }
        },
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
            queryClient.invalidateQueries({ queryKey: ["dashboard", "orders"] });
        },
    });
}
