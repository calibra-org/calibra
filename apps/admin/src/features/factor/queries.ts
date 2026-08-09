"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

import type {
    FactorCustomerResource,
    FactorDocument,
    FactorDocumentInput,
    FactorDocumentUpdateInput,
    FactorPayment,
    FactorProductResource,
    FactorReports,
    FactorSettings,
    FactorStatus,
    FactorSummary,
    FactorType,
} from "./types";

interface Envelope<T> {
    data: T;
}

interface ListEnvelope<T> extends Envelope<T[]> {
    meta: { page: number; limit: number; total: number; lastPage: number };
}

export interface FactorListParams {
    page?: number;
    limit?: number;
    q?: string;
    type?: FactorType | "all";
    status?: FactorStatus | "all";
    from?: string;
    to?: string;
    sort?: "created_desc" | "created_asc" | "due_asc" | "amount_desc";
}

export function useFactorDocuments(params: FactorListParams = {}) {
    const locale = useLocale();
    const query = {
        page: params.page ?? 1,
        limit: params.limit ?? 25,
        q: params.q || undefined,
        type: params.type && params.type !== "all" ? params.type : undefined,
        status: params.status && params.status !== "all" ? params.status : undefined,
        from: params.from || undefined,
        to: params.to || undefined,
        sort: params.sort ?? "created_desc",
    };
    return useQuery({
        queryKey: ["admin", "factor", "documents", { locale, ...query }],
        queryFn: () => apiGet<ListEnvelope<FactorDocument>>("factor/documents", { locale, query }),
        placeholderData: (previous) => previous,
    });
}

export function useFactorSummary() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "factor", "summary", { locale }],
        queryFn: () => apiGet<Envelope<FactorSummary>>("factor/summary", { locale }),
        select: (payload) => payload.data,
        refetchInterval: 30_000,
    });
}

export function useFactorDocument(id: number) {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "factor", "document", id, { locale }],
        queryFn: () => apiGet<Envelope<FactorDocument>>(`factor/documents/${id}`, { locale }),
        select: (payload) => payload.data,
        enabled: id > 0,
    });
}

function useFactorInvalidation() {
    const client = useQueryClient();
    return (id?: number) => {
        client.invalidateQueries({ queryKey: ["admin", "factor", "documents"] });
        client.invalidateQueries({ queryKey: ["admin", "factor", "summary"] });
        client.invalidateQueries({ queryKey: ["admin", "factor", "reports"] });
        if (id !== undefined) client.invalidateQueries({ queryKey: ["admin", "factor", "document", id] });
        client.invalidateQueries({ queryKey: ["admin", "orders"] });
    };
}

export function useCreateFactorDocument() {
    const locale = useLocale();
    const invalidate = useFactorInvalidation();
    return useMutation({
        mutationFn: (body: FactorDocumentInput) =>
            apiMutate<Envelope<FactorDocument>>("POST", "factor/documents", { locale, body }),
        onSuccess: () => invalidate(),
    });
}

export function useUpdateFactorDocument(id: number) {
    const locale = useLocale();
    const invalidate = useFactorInvalidation();
    return useMutation({
        mutationFn: (body: FactorDocumentUpdateInput) =>
            apiMutate<Envelope<FactorDocument>>("PATCH", `factor/documents/${id}`, { locale, body }),
        onSuccess: () => invalidate(id),
    });
}

export function useTransitionFactorDocument(id: number) {
    const locale = useLocale();
    const invalidate = useFactorInvalidation();
    return useMutation({
        mutationFn: (body: {
            to_status: "sent" | "viewed" | "awaiting" | "paid" | "expired" | "cancelled";
            reason?: string | null;
            expected_version: number;
        }) => apiMutate<Envelope<FactorDocument>>("POST", `factor/documents/${id}/transition`, { locale, body }),
        onSuccess: () => invalidate(id),
    });
}

export function useConvertFactorDocument(id: number) {
    const locale = useLocale();
    const invalidate = useFactorInvalidation();
    return useMutation({
        mutationFn: (body: { target_type: "invoice" | "credit_note"; expected_version: number; reason?: string | null }) =>
            apiMutate<Envelope<FactorDocument>>("POST", `factor/documents/${id}/convert`, {
                locale,
                body,
            }),
        onSuccess: () => invalidate(id),
    });
}

export function useCreateFactorPaymentLink(id: number) {
    const locale = useLocale();
    const invalidate = useFactorInvalidation();
    return useMutation({
        mutationFn: (body: { gateway_id: number; expires_at?: string | null; expected_version: number }) =>
            apiMutate<Envelope<{ code: string; expires_at: string; path: string }>>(
                "POST",
                `factor/documents/${id}/payment-link`,
                { locale, body },
            ),
        onSuccess: () => invalidate(id),
    });
}

export function useRecordFactorPayment(id: number) {
    const locale = useLocale();
    const invalidate = useFactorInvalidation();
    return useMutation({
        mutationFn: (body: {
            amount_minor: number;
            method: "manual" | "cash" | "card" | "bank_transfer";
            reference?: string | null;
            notes?: string | null;
            paid_at?: string | null;
            expected_version: number;
        }) => apiMutate<Envelope<FactorDocument>>("POST", `factor/documents/${id}/manual-payment`, { locale, body }),
        onSuccess: () => invalidate(id),
    });
}

export function useFactorReports() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "factor", "reports", { locale }],
        queryFn: () => apiGet<Envelope<FactorReports>>("factor/reports", { locale }),
        select: (payload) => payload.data,
    });
}

export function useFactorSettings() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "factor", "settings", { locale }],
        queryFn: () => apiGet<Envelope<FactorSettings>>("factor/settings", { locale }),
        select: (payload) => payload.data,
    });
}

export function useUpdateFactorSettings() {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: Partial<FactorSettings>) =>
            apiMutate<Envelope<FactorSettings>>("PATCH", "factor/settings", { locale, body }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "factor", "settings"] }),
    });
}

export function useFactorCustomers(q: string) {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "factor", "resources", "customers", q, { locale }],
        queryFn: () =>
            apiGet<Envelope<FactorCustomerResource[]>>("factor/resources", {
                locale,
                query: { kind: "customers", q: q || undefined, limit: 30 },
            }),
        select: (payload) => payload.data,
        staleTime: 30_000,
    });
}

export function useFactorProducts(q: string) {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "factor", "resources", "products", q, { locale }],
        queryFn: () =>
            apiGet<Envelope<FactorProductResource[]>>("factor/resources", {
                locale,
                query: { kind: "products", q: q || undefined, limit: 30 },
            }),
        select: (payload) => payload.data,
        staleTime: 30_000,
    });
}

export type { FactorPayment };

export interface PaymentAttemptRow {
    id: number;
    order_id: number;
    gateway_id: number;
    document_id: number;
    document_reference: string | null;
    document_status: FactorStatus;
    gateway_code: string;
    status: string;
    amount_minor: number;
    currency: string;
    gateway_authority: string | null;
    gateway_transaction_id: string | null;
    error_code: string | null;
    error_message: string | null;
    initiated_at: string | null;
    verified_at: string | null;
    created_at: string | null;
}

export function useFactorPaymentAttempts(params: { page?: number; limit?: number; status?: string; q?: string } = {}) {
    const locale = useLocale();
    const query = {
        page: params.page ?? 1,
        limit: params.limit ?? 25,
        status: params.status || undefined,
        q: params.q || undefined,
    };
    return useQuery({
        queryKey: ["admin", "factor", "payment-attempts", { locale, ...query }],
        queryFn: () =>
            apiGet<ListEnvelope<PaymentAttemptRow>>("factor/payment-attempts", {
                locale,
                query,
            }),
        placeholderData: (previous) => previous,
        staleTime: 15_000,
    });
}
