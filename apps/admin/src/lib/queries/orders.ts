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
    /** Multi-select source filter (mirrors the toolbar facet). Serialised as `?source=a,b,c`. */
    sources?: string[];
    /** Multi-select payment-method filter — values are payment_gateway.code snapshots. */
    payments?: string[];
    /** Multi-select billing-country filter (ISO-3166 alpha-2). */
    countries?: string[];
    /** Unified date filter string (`<op>:<value>`); see `apps/api/.../date_filter_parser.ts`. */
    created?: string;
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
    const created = params.created;
    const customerId = params.customerId;
    /** Serialise multi-select facets as CSV; absent / empty arrays drop out of the URL entirely. */
    const sources = csvOrUndefined(params.sources);
    const payments = csvOrUndefined(params.payments);
    const countries = csvOrUndefined(params.countries);
    return useQuery<OrderListEnvelope, Error, Paginated<AdminOrder>>({
        queryKey: [
            "admin",
            "orders",
            "list",
            { locale, page, perPage, status, search, sort, createdVia, sources, payments, countries, created, customerId },
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
                    source: sources,
                    payment: payments,
                    country: countries,
                    created,
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

function csvOrUndefined(values: string[] | undefined): string | undefined {
    if (values === undefined || values.length === 0) return undefined;
    return values.join(",");
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
        {
            data: {
                id: number;
                body: string;
                visibility: "internal" | "customer";
                author_user_id: number | null;
                created_at: string;
            }[];
        },
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
                                body: change.reason
                                    ? { to_status: change.to_status, reason: change.reason }
                                    : { to_status: change.to_status },
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

/* -------------------------------------------------------------------------- */
/*  Phase 2 — order editor mutations                                          */
/*  Each hook owns its own invalidation of the affected resource so the       */
/*  detail page never has to chain `await Promise.all([refetchA, refetchB])`. */
/* -------------------------------------------------------------------------- */

export interface AddressUpdateInput {
    id: number;
    kind: "billing" | "shipping";
    address: {
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
        national_id?: string | null;
        customer_note?: string | null;
    };
}

export function useUpdateOrderAddress() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, AddressUpdateInput>({
        mutationFn: ({ id, kind, address }) =>
            apiMutate<OrderEnvelope>("PATCH", `orders/${id}/addresses/${kind}`, { locale, body: address }),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
        },
    });
}

export interface AddLineItemInput {
    id: number;
    product_id: number;
    variation_id?: number | null;
    quantity: number;
    price_override_minor?: number | null;
}

export function useAddOrderLineItem() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, AddLineItemInput>({
        mutationFn: ({ id, ...body }) => apiMutate<OrderEnvelope>("POST", `orders/${id}/line-items`, { locale, body }),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
        },
    });
}

export interface UpdateLineItemInput {
    id: number;
    line_id: number;
    quantity?: number;
    price_override_minor?: number | null;
    name?: string;
}

export function useUpdateOrderLineItem() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, UpdateLineItemInput>({
        mutationFn: ({ id, line_id, ...body }) =>
            apiMutate<OrderEnvelope>("PATCH", `orders/${id}/line-items/${line_id}`, { locale, body }),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
        },
    });
}

export function useDeleteOrderLineItem() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, { id: number; line_id: number }>({
        mutationFn: ({ id, line_id }) => apiMutate<OrderEnvelope>("DELETE", `orders/${id}/line-items/${line_id}`, { locale }),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
        },
    });
}

export interface AddFeeInput {
    id: number;
    title: string;
    amount_minor: number;
    taxable?: boolean;
    tax_class_id?: number | null;
}

export function useAddOrderFee() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, AddFeeInput>({
        mutationFn: ({ id, ...body }) => apiMutate<OrderEnvelope>("POST", `orders/${id}/fee-lines`, { locale, body }),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
        },
    });
}

export function useDeleteOrderFee() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, { id: number; fee_id: number }>({
        mutationFn: ({ id, fee_id }) => apiMutate<OrderEnvelope>("DELETE", `orders/${id}/fee-lines/${fee_id}`, { locale }),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
        },
    });
}

export interface AddShippingLineInput {
    id: number;
    method_code: string;
    title: string;
    total_minor: number;
    tax_class_id?: number | null;
}

export function useAddOrderShippingLine() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, AddShippingLineInput>({
        mutationFn: ({ id, ...body }) => apiMutate<OrderEnvelope>("POST", `orders/${id}/shipping-lines`, { locale, body }),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
        },
    });
}

export interface UpdateShippingLineInput {
    id: number;
    line_id: number;
    method_code?: string;
    title?: string;
    total_minor?: number;
    tax_class_id?: number | null;
}

export function useUpdateOrderShippingLine() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, UpdateShippingLineInput>({
        mutationFn: ({ id, line_id, ...body }) =>
            apiMutate<OrderEnvelope>("PATCH", `orders/${id}/shipping-lines/${line_id}`, { locale, body }),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
        },
    });
}

export function useDeleteOrderShippingLine() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, { id: number; line_id: number }>({
        mutationFn: ({ id, line_id }) => apiMutate<OrderEnvelope>("DELETE", `orders/${id}/shipping-lines/${line_id}`, { locale }),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
        },
    });
}

export function useApplyOrderCoupon() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, { id: number; code: string }>({
        mutationFn: ({ id, code }) => apiMutate<OrderEnvelope>("POST", `orders/${id}/coupons`, { locale, body: { code } }),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
        },
    });
}

export function useRemoveOrderCoupon() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, { id: number; code: string }>({
        mutationFn: ({ id, code }) =>
            apiMutate<OrderEnvelope>("DELETE", `orders/${id}/coupons/${encodeURIComponent(code)}`, { locale }),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
        },
    });
}

export interface RecalculateTotalsPreview {
    itemsTotal: number;
    itemsTaxTotal: number;
    shippingTotal: number;
    shippingTaxTotal: number;
    feesTotal: number;
    feesTaxTotal: number;
    discountTotal: number;
    discountTaxTotal: number;
    taxTotal: number;
    grandTotal: number;
}

interface RecalculatePreviewEnvelope {
    data: { preview: RecalculateTotalsPreview; current: RecalculateTotalsPreview };
}

export function useRecalculateOrderTotals() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope | RecalculatePreviewEnvelope, Error, { id: number; preview?: boolean }>({
        mutationFn: ({ id, preview }) =>
            apiMutate("POST", `orders/${id}/recalculate-totals`, {
                locale,
                body: preview === true ? { preview: true } : {},
            }),
        onSettled: (_data, _err, { id, preview }) => {
            if (preview === true) return;
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
        },
    });
}

export interface UpdateOrderHeaderInput {
    id: number;
    created_at?: string;
    customer_id?: number | null;
    billing_email?: string | null;
    is_locked?: boolean;
}

export function useUpdateOrderHeader() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, UpdateOrderHeaderInput>({
        mutationFn: ({ id, ...body }) => apiMutate<OrderEnvelope>("PATCH", `orders/${id}/header`, { locale, body }),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
        },
    });
}

export interface CustomerStats {
    lifetime_order_count: number;
    lifetime_revenue_minor: number;
    average_order_value_minor: number;
}

export function useOrderCustomerStats(orderId: number) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: CustomerStats }, Error, CustomerStats>({
        queryKey: ["admin", "orders", "customer-stats", orderId, { locale }],
        queryFn: () => apiGet(`orders/${orderId}/customer-stats`, { locale }),
        select: (payload) => payload.data,
        enabled: orderId > 0,
        staleTime: 60_000,
    });
}

export function useUpsertOrderMeta() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, { id: number; key: string; value: string }>({
        mutationFn: ({ id, key, value }) =>
            apiMutate<OrderEnvelope>("PATCH", `orders/${id}/meta`, { locale, body: { key, value } }),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
        },
    });
}

export function useDeleteOrderMeta() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<OrderEnvelope, Error, { id: number; key: string }>({
        mutationFn: ({ id, key }) =>
            apiMutate<OrderEnvelope>("DELETE", `orders/${id}/meta/${encodeURIComponent(key)}`, { locale }),
        onSettled: (_data, _err, { id }) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "orders", "detail", id] });
        },
    });
}
