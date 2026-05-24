"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { type SdkAdminOrderListRow, toAdminOrderDetail, toAdminOrderListRow } from "#/lib/adapters/orders";
import { apiGet, apiMutate } from "#/lib/queries/api-client";
import type { AdminOrder, OrderStatus, Paginated } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];

interface OrderEnvelope {
    data: Schemas["AdminOrderDetail"];
}

interface OrderListEnvelope {
    data: SdkAdminOrderListRow[];
    meta?: { page: number; perPage: number; total: number; lastPage: number };
}

/** Surface for the admin tab strip — `all` plus one count per backend status, plus `trashed`. */
export type OrderCountsMap = {
    all: number;
    trashed: number;
} & Record<OrderStatus, number>;

interface OrderCountsEnvelope {
    data: OrderCountsMap;
}

export interface OrdersListParams {
    page?: number;
    perPage?: number;
    status?: OrderStatus | "any" | "trashed";
    search?: string;
    sort?: string;
    createdVia?: string;
    after?: string;
    before?: string;
    customerId?: number;
}

/**
 * Paginated admin orders list. `status === "any"` (and `undefined`) skip the filter; non-`any`
 * values feed the API's `status=` query. Search is forwarded verbatim. Every filter dimension
 * lives in the query key so toggles refetch instead of mutating the same cache entry.
 */
export function useOrdersList(params: OrdersListParams = {}) {
    const locale = useLocale() as Locale;
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 25;
    const status = params.status === "any" ? undefined : params.status;
    const search = params.search;
    const sort = params.sort;
    const createdVia = params.createdVia;
    const after = params.after;
    const before = params.before;
    const customerId = params.customerId;
    return useQuery<OrderListEnvelope, Error, Paginated<AdminOrder>>({
        queryKey: [
            "admin",
            "orders",
            "list",
            { locale, page, perPage, status, search, sort, createdVia, after, before, customerId },
        ],
        queryFn: () =>
            apiGet<OrderListEnvelope>("orders", {
                locale,
                query: {
                    page,
                    perPage,
                    status,
                    search,
                    sort,
                    created_via: createdVia,
                    after,
                    before,
                    customer_id: customerId,
                },
            }),
        select: (payload) => ({
            data: (payload.data ?? []).map(toAdminOrderListRow),
            meta: payload.meta ?? { page, perPage, total: payload.data?.length ?? 0, lastPage: 1 },
        }),
        placeholderData: (previous) => previous,
    });
}

/**
 * Tab-strip count source — single endpoint hit returning a `{ status: count }` map. Refetched on
 * an aggressive interval (15 s) so a status flip in another tab is visible without a manual
 * refresh; the API caches for 10 s so the load is bounded regardless of how many admins are open.
 */
export function useOrderCounts() {
    return useQuery<OrderCountsEnvelope, Error, OrderCountsMap>({
        queryKey: ["admin", "orders", "counts"],
        queryFn: () => apiGet<OrderCountsEnvelope>("orders/counts", { locale: "fa" }),
        select: (payload) => payload.data,
        refetchInterval: 15_000,
        staleTime: 10_000,
    });
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
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "list"] });
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "counts"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard", "orders"] });
        },
    });
}

export interface MarkShippedInput {
    id: number;
    tracking_number?: string | null;
    tracking_url?: string | null;
    carrier?: string | null;
    notify_customer?: boolean;
}

/** Stamps tracking metadata + transitions processing → completed. Idempotent for re-shipping. */
export function useMarkShipped() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, MarkShippedInput>({
        mutationFn: ({ id, ...body }) => apiMutate<OrderEnvelope>("POST", `orders/${id}/mark-shipped`, { locale, body }),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "list"] });
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "counts"] });
        },
    });
}

/** Async re-send. Returns 202 with `{ order_id, queued }` — toast on success, no cache flip. */
export function useResendConfirmation() {
    const locale = useLocale() as Locale;
    return useMutation<{ data: { order_id: number; queued: boolean } }, Error, { id: number }>({
        mutationFn: ({ id }) => apiMutate("POST", `orders/${id}/resend-confirmation`, { locale }),
    });
}

export interface CreateOrderNoteInput {
    order_id: number;
    body: string;
    visibility: "internal" | "customer";
    send_email?: boolean;
}

interface NoteEnvelope {
    data: {
        id: number;
        body: string;
        visibility: "internal" | "customer";
        author_user_id: number | null;
        author_name?: string | null;
        created_at: string;
    };
}

/** Appends an internal or customer-visible note to the order's timeline. */
export function useAddOrderNote() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<NoteEnvelope, Error, CreateOrderNoteInput>({
        mutationFn: ({ order_id, ...body }) => apiMutate<NoteEnvelope>("POST", `orders/${order_id}/notes`, { locale, body }),
        onSettled: (_data, _err, { order_id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "notes", order_id] });
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "timeline", order_id] });
        },
    });
}

export interface RefundLineInput {
    order_line_item_id: number;
    quantity: number;
    refund_amount_minor?: number | null;
    refund_tax_minor?: number | null;
}

export interface CreateRefundInput {
    order_id: number;
    amount_minor?: number | null;
    line_items?: RefundLineInput[];
    reason?: string | null;
    restock_requested?: boolean;
}

interface RefundEnvelope {
    data: {
        id: number;
        order_id: number;
        refund_number: number;
        amount_minor: number;
        reason: string | null;
        processed_at: string | null;
    };
}

/** Issues a full or partial refund through {@link RefundService}. */
export function useCreateRefund() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<RefundEnvelope, Error, CreateRefundInput>({
        mutationFn: ({ order_id, ...body }) => apiMutate<RefundEnvelope>("POST", `orders/${order_id}/refunds`, { locale, body }),
        onSettled: (_data, _err, { order_id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", order_id] });
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "refunds", order_id] });
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "list"] });
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "counts"] });
        },
    });
}

/** Notes list for the unified timeline. Public-or-internal toggle is left to the caller. */
export function useOrderNotes(orderId: number) {
    const locale = useLocale() as Locale;
    return useQuery<
        { data: { id: number; body: string; visibility: "internal" | "customer"; author_user_id: number | null; created_at: string }[] },
        Error
    >({
        queryKey: ["admin", "orders", "notes", orderId, { locale }],
        queryFn: () => apiGet(`orders/${orderId}/notes?perPage=100`, { locale }),
        enabled: orderId > 0,
    });
}

/** Refunds list for the timeline + refunds card. */
export function useOrderRefunds(orderId: number) {
    const locale = useLocale() as Locale;
    return useQuery<
        {
            data: {
                id: number;
                refund_number: number;
                amount_minor: number;
                reason: string | null;
                processed_at: string | null;
                refunded_by_user_id: number | null;
                restock_requested: boolean;
            }[];
        },
        Error
    >({
        queryKey: ["admin", "orders", "refunds", orderId, { locale }],
        queryFn: () => apiGet(`orders/${orderId}/refunds?perPage=100`, { locale }),
        enabled: orderId > 0,
    });
}

export interface DeleteOrderInput {
    id: number;
}

export function useDeleteOrder() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<void, Error, DeleteOrderInput>({
        mutationFn: ({ id }) => apiMutate("DELETE", `orders/${id}`, { locale }),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "list"] });
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "counts"] });
        },
    });
}

export interface BulkUpdateOrdersInput {
    /** Status patches — batched in chunks of 10 so a single click on "Mark 500 processing" is responsive. */
    statusChanges?: Array<{ id: number; to_status: OrderStatus; reason?: string }>;
    /** IDs to soft-delete via the batch endpoint. */
    deleteIds?: number[];
}

/**
 * Bulk action runner. The batch endpoint handles soft-delete in a single call; status changes
 * need one POST per order (the state machine validates per row), so we chunk them concurrently
 * but keep the chunk size small enough to avoid swamping the proxy.
 */
export function useBulkUpdateOrders() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<void, Error, BulkUpdateOrdersInput>({
        mutationFn: async ({ statusChanges, deleteIds }) => {
            if (deleteIds && deleteIds.length > 0) {
                await apiMutate("POST", "orders/batch", { locale, body: { delete: deleteIds } });
            }
            if (statusChanges && statusChanges.length > 0) {
                const chunkSize = 5;
                for (let i = 0; i < statusChanges.length; i += chunkSize) {
                    const slice = statusChanges.slice(i, i + chunkSize);
                    await Promise.all(
                        slice.map((change) =>
                            apiMutate("POST", `orders/${change.id}/status`, {
                                locale,
                                body: change.reason ? { to_status: change.to_status, reason: change.reason } : { to_status: change.to_status },
                            }),
                        ),
                    );
                }
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "list"] });
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "counts"] });
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail"] });
        },
    });
}

export interface CreateOrderInput {
    customer_id?: number | null;
    billing_address: {
        first_name: string;
        last_name: string;
        company?: string | null;
        address_line_1: string;
        address_line_2?: string | null;
        city: string;
        region_id?: number | null;
        region_text?: string | null;
        postcode?: string | null;
        country: string;
        phone?: string | null;
        email?: string | null;
    };
    shipping_address?: CreateOrderInput["billing_address"];
    payment_gateway_id: number;
    customer_note?: string | null;
    lines: { product_id: number; variation_id?: number | null; quantity: number }[];
}

export function useCreateOrder() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, CreateOrderInput>({
        mutationFn: (body) => apiMutate<OrderEnvelope>("POST", "orders", { locale, body }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "list"] });
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "counts"] });
        },
    });
}
