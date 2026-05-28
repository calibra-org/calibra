"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { toAdminCoupon } from "#/lib/adapters/coupons";
import { apiGet, apiMutate } from "#/lib/queries/api-client";
import { type TableViewQuery, tableViewQueryToSdkQuery } from "#/lib/table-view";
import type { AdminCoupon, AdminCouponCounts, CouponTabKey, Paginated } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];

interface CouponListEnvelope {
    data: Schemas["AdminCoupon"][];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}

/**
 * Inputs accepted by {@link useCouponsList}. `query` carries the unified TableView grammar — the
 * per-column facet (`discount_type`) and the boolean column toggles (`free_shipping` /
 * `individual_use` / `exclude_sale_items`) live inside `query.filter` as `filter[]` entries, NOT
 * here. The fields below are the only true top-level extras the controller declares: tab scope,
 * free-text search, and the existence-check predicates the runtime can't model as a column WHERE.
 */
export interface CouponsListParams {
    query?: TableViewQuery;
    q?: string;
    tab?: CouponTabKey;
    expiring_soon?: boolean;
    has_product_constraints?: boolean;
    has_category_constraints?: boolean;
    has_email_restrictions?: boolean;
}

/**
 * Top-level extras the coupons endpoint accepts. Keys mirror the controller's `compileStrict`
 * extras verbatim (`apps/api/app/controllers/admin/coupons_controller.ts`); `satisfies` flags a
 * typo'd key before it can 422.
 */
interface CouponsListExtras {
    q?: string;
    tab?: CouponTabKey;
    expiring_soon?: boolean;
    has_product_constraints?: boolean;
    has_category_constraints?: boolean;
    has_email_restrictions?: boolean;
}

const PER_PAGE_DEFAULT = 25;

export function useCouponsList(params: CouponsListParams = {}) {
    const locale = useLocale() as Locale;
    const query: TableViewQuery = params.query ?? { page: 1, limit: PER_PAGE_DEFAULT, filter: [], filterOr: [], sort: [] };
    const sdkQuery = tableViewQueryToSdkQuery(query, {
        q: params.q,
        tab: params.tab !== undefined && params.tab !== "any" ? params.tab : undefined,
        expiring_soon: params.expiring_soon === true ? true : undefined,
        has_product_constraints: params.has_product_constraints === true ? true : undefined,
        has_category_constraints: params.has_category_constraints === true ? true : undefined,
        has_email_restrictions: params.has_email_restrictions === true ? true : undefined,
    } satisfies CouponsListExtras);
    return useQuery<CouponListEnvelope, Error, Paginated<AdminCoupon>>({
        queryKey: ["admin", "coupons", "list", { locale, sdkQuery }],
        queryFn: () => apiGet<CouponListEnvelope>("coupons", { locale, query: sdkQuery }),
        select: (payload) => ({
            data: (payload.data ?? []).map(toAdminCoupon),
            meta: payload.meta ?? {
                page: query.page,
                limit: query.limit,
                total: payload.data?.length ?? 0,
                lastPage: 1,
            },
        }),
    });
}

interface CountsEnvelope {
    data: {
        all: number;
        active: number;
        disabled: number;
        expired: number;
        scheduled: number;
        used: number;
        trashed: number;
        expiring_soon: number;
    };
}

export function useCouponCounts() {
    const locale = useLocale() as Locale;
    return useQuery<CountsEnvelope, Error, AdminCouponCounts>({
        queryKey: ["admin", "coupons", "counts", { locale }],
        queryFn: () => apiGet<CountsEnvelope>("coupons/counts", { locale }),
        select: (payload) => ({
            all: payload.data.all,
            active: payload.data.active,
            disabled: payload.data.disabled,
            expired: payload.data.expired,
            scheduled: payload.data.scheduled,
            used: payload.data.used,
            trashed: payload.data.trashed,
            expiringSoon: payload.data.expiring_soon,
        }),
        staleTime: 30_000,
    });
}

interface CodeCheckEnvelope {
    data: { available: boolean; suggestion: string | null; reason?: string };
}

export function useCouponCodeCheck(code: string, enabled = true) {
    const locale = useLocale() as Locale;
    const trimmed = code.trim();
    return useQuery<CodeCheckEnvelope, Error, { available: boolean; suggestion: string | null; reason?: string }>({
        queryKey: ["admin", "coupons", "code-check", { locale, code: trimmed }],
        queryFn: () => apiGet<CodeCheckEnvelope>("coupons/code-check", { locale, query: { code: trimmed } }),
        select: (payload) => payload.data,
        enabled: enabled && trimmed.length >= 2,
        staleTime: 5_000,
    });
}

interface CouponEnvelope {
    data: Schemas["AdminCoupon"];
}

export function useCoupon(id: number | null) {
    const locale = useLocale() as Locale;
    return useQuery<CouponEnvelope, Error, AdminCoupon>({
        queryKey: ["admin", "coupons", "detail", { locale, id }],
        queryFn: () => apiGet<CouponEnvelope>(`coupons/${id}`, { locale }),
        select: (payload) => toAdminCoupon(payload.data),
        enabled: id !== null,
    });
}

/** Payload shape sent to create/update — mirrors the backend coupon validator. */
export interface CouponWritePayload {
    code?: string;
    discount_type?: "percent" | "fixed_cart" | "fixed_product" | "free_shipping";
    amount_minor?: number | null;
    amount_percent?: number | null;
    starts_at?: string | null;
    expires_at?: string | null;
    individual_use?: boolean;
    exclude_sale_items?: boolean;
    minimum_amount?: number | null;
    maximum_amount?: number | null;
    usage_limit_global?: number | null;
    usage_limit_per_user?: number | null;
    limit_usage_to_x_items?: number | null;
    free_shipping?: boolean;
    status?: "active" | "disabled";
    translations?: { locale: string; description?: string | null }[];
    product_constraints?: { product_id: number; mode: "include" | "exclude" }[];
    category_constraints?: { category_id: number; mode: "include" | "exclude" }[];
    brand_constraints?: { brand_id: number; mode: "include" | "exclude" }[];
    email_restrictions?: string[];
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
    qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
}

export function useCreateCoupon() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation<CouponEnvelope, Error, CouponWritePayload>({
        mutationFn: (body) => apiMutate<CouponEnvelope>("POST", "coupons", { locale, body }),
        onSuccess: () => invalidateAll(qc),
    });
}

export function useUpdateCoupon(id: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation<CouponEnvelope, Error, CouponWritePayload>({
        mutationFn: (body) => apiMutate<CouponEnvelope>("PATCH", `coupons/${id}`, { locale, body }),
        onSuccess: () => invalidateAll(qc),
    });
}

export function useDeleteCoupon() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation<unknown, Error, number>({
        mutationFn: (id) => apiMutate<unknown>("DELETE", `coupons/${id}`, { locale }),
        onSuccess: () => invalidateAll(qc),
    });
}

export interface BulkCouponPayload {
    update?: ({ id: number } & CouponWritePayload)[];
    delete?: number[];
}

export function useBulkUpdateCoupons() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation<unknown, Error, BulkCouponPayload>({
        mutationFn: (body) => apiMutate<unknown>("POST", "coupons/batch", { locale, body }),
        onSuccess: () => invalidateAll(qc),
    });
}

export interface TestPayload {
    customer_id?: number | null;
    email?: string | null;
    line_items: { product_id: number; quantity: number; price_minor?: number }[];
    shipping_method_id?: number | null;
    country?: string;
}

export interface TestResult {
    eligible: boolean;
    reason?: string;
    reason_message?: string;
    calculation?: {
        items_subtotal_minor: number;
        discount_minor: number;
        shipping_minor: number;
        grand_total_minor: number;
    };
}

export function useTestCoupon(id: number) {
    const locale = useLocale() as Locale;
    return useMutation<{ data: TestResult }, Error, TestPayload>({
        mutationFn: (body) => apiMutate<{ data: TestResult }>("POST", `coupons/${id}/test`, { locale, body }),
    });
}

interface RedemptionsEnvelope {
    data: {
        id: number;
        coupon_id: number;
        customer_id: number | null;
        email: string | null;
        order_id: number | null;
        discount_minor: number;
        redeemed_at: string;
    }[];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}

export function useCouponRedemptions(id: number, page = 1, limit = 10) {
    const locale = useLocale() as Locale;
    return useQuery<RedemptionsEnvelope>({
        queryKey: ["admin", "coupons", "redemptions", { locale, id, page, limit }],
        queryFn: () => apiGet<RedemptionsEnvelope>(`coupons/${id}/redemptions`, { locale, query: { page, limit } }),
    });
}
