"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { toAdminCoupon } from "#/lib/adapters/coupons";
import { apiGet, apiMutate } from "#/lib/queries/api-client";
import type { AdminCoupon, AdminCouponCounts, CouponTabKey, Paginated } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];

interface CouponListEnvelope {
    data: Schemas["AdminCoupon"][];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}

export interface CouponsListParams {
    page?: number;
    limit?: number;
    search?: string;
    tab?: CouponTabKey;
    sort?: string;
    /** Faceted filter values keyed by TableView column. Multi-select → `filter[]=col:in:a,b`. */
    facets?: Record<string, string[] | undefined>;
    booleans?: Record<string, boolean | undefined>;
}

/**
 * Boolean toggles that map to TableView filter columns (`filter[]=col:eq:true`). The remaining
 * toggles (`expiring_soon`, `has_*_constraints`) are controller-side existence checks the
 * runtime can't model as per-column predicates, so they ride as top-level boolean extras.
 */
const FILTER_COLUMN_TOGGLES = new Set(["free_shipping", "individual_use", "exclude_sale_items"]);

/**
 * Serialize the toolbar state into the unified TableView wire grammar the migrated
 * `/admin/coupons` endpoint speaks: `q` for free-text, `sort[]=field:dir`, and
 * `filter[]=field:op:value` for every per-column facet / toggle. `tab` and the existence-check
 * toggles stay as declared top-level extras. Toggles only emit when on — an off toggle means
 * "don't filter", not "filter for false".
 */
function buildQuery(params: CouponsListParams): Record<string, string | number | boolean | string[] | undefined> {
    const filters: string[] = [];
    const out: Record<string, string | number | boolean | string[] | undefined> = {
        page: params.page ?? 1,
        limit: params.limit ?? 25,
    };
    if (params.search && params.search.length > 0) out.q = params.search;
    if (params.tab && params.tab !== "any") out.tab = params.tab;
    if (params.sort && params.sort.length > 0) {
        const dir = params.sort.startsWith("-") ? "desc" : "asc";
        const field = params.sort.replace(/^-/, "");
        out["sort[]"] = [`${field}:${dir}`];
    }
    for (const [key, values] of Object.entries(params.facets ?? {})) {
        if (Array.isArray(values) && values.length > 0) filters.push(`${key}:in:${values.join(",")}`);
    }
    for (const [key, value] of Object.entries(params.booleans ?? {})) {
        if (value !== true) continue;
        if (FILTER_COLUMN_TOGGLES.has(key)) filters.push(`${key}:eq:true`);
        else out[key] = true;
    }
    if (filters.length > 0) out["filter[]"] = filters;
    return out;
}

export function useCouponsList(params: CouponsListParams = {}) {
    const locale = useLocale() as Locale;
    return useQuery<CouponListEnvelope, Error, Paginated<AdminCoupon>>({
        queryKey: ["admin", "coupons", "list", { locale, params }],
        queryFn: () => apiGet<CouponListEnvelope>("coupons", { locale, query: buildQuery(params) }),
        select: (payload) => ({
            data: (payload.data ?? []).map(toAdminCoupon),
            meta: payload.meta ?? {
                page: params.page ?? 1,
                limit: params.limit ?? 25,
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
