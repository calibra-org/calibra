"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { platformGet, platformSend } from "#/lib/api-client";
import type { MetricsRange, Overview, Paginated, Plan, TenantDetail, TenantListItem, TenantMetrics } from "#/lib/types";

/** Single envelope unwrap helper — every control-plane response is `{ data, … }`. */
type Envelope<T> = { data: T };

/** Toolbar state for the fleet list, serialized to the TableView wire grammar. */
export interface TenantsQuery {
    page: number;
    q?: string;
    status?: string;
    planId?: number;
    sort?: string;
}

function tenantsQueryString(query: TenantsQuery): string {
    const params = new URLSearchParams();
    params.set("page", String(query.page));
    params.set("limit", "20");
    if (query.q) params.set("q", query.q);
    if (query.status) params.append("filter[]", `status:eq:${query.status}`);
    if (query.planId) params.append("filter[]", `plan_id:eq:${query.planId}`);
    if (query.sort) params.append("sort[]", query.sort);
    return params.toString();
}

export function useOverview() {
    return useQuery({
        queryKey: ["overview"],
        queryFn: () => platformGet<Envelope<Overview>>("overview").then((r) => r.data),
    });
}

export function useTenants(query: TenantsQuery) {
    return useQuery({
        queryKey: ["tenants", query],
        queryFn: () => platformGet<Paginated<TenantListItem>>(`tenants?${tenantsQueryString(query)}`),
    });
}

export function useTenant(id: number | string) {
    return useQuery({
        queryKey: ["tenant", String(id)],
        queryFn: () => platformGet<Envelope<TenantDetail>>(`tenants/${id}`).then((r) => r.data),
    });
}

export function useTenantMetrics(id: number | string, range: MetricsRange) {
    return useQuery({
        queryKey: ["tenant-metrics", String(id), range],
        queryFn: () => platformGet<Envelope<TenantMetrics>>(`tenants/${id}/metrics?range=${range}`).then((r) => r.data),
    });
}

export function usePlans() {
    return useQuery({
        queryKey: ["plans"],
        queryFn: () => platformGet<Envelope<Plan[]>>("plans").then((r) => r.data),
    });
}

export interface ProvisionInput {
    slug: string;
    name: string;
    plan_key: string;
    currency_code: string;
    primary_locale?: string;
    owner_email?: string;
    owner_phone?: string;
}

export function useProvisionTenant() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: ProvisionInput) =>
            platformSend<Envelope<TenantDetail & { shop_url: string }>>("POST", "tenants", input).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["tenants"] });
            qc.invalidateQueries({ queryKey: ["overview"] });
        },
    });
}

export function useUpdateTenant(id: number | string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (patch: Record<string, unknown>) =>
            platformSend<Envelope<TenantDetail>>("PATCH", `tenants/${id}`, patch).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["tenant", String(id)] });
            qc.invalidateQueries({ queryKey: ["tenants"] });
        },
    });
}

export function useAttachDomain(id: number | string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (domain: string) => platformSend("POST", `tenants/${id}/domains`, { domain }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", String(id)] }),
    });
}

export function useDetachDomain(id: number | string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (domainId: number) => platformSend("DELETE", `tenants/${id}/domains/${domainId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", String(id)] }),
    });
}

export function useRecheckDomain(id: number | string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (domainId: number) => platformSend("POST", `tenants/${id}/domains/${domainId}/recheck`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", String(id)] }),
    });
}

export function useImpersonate(id: number | string) {
    return useMutation({
        mutationFn: () =>
            platformSend<Envelope<{ token: { value: string }; admin_url: string }>>("POST", `tenants/${id}/impersonate`).then(
                (r) => r.data,
            ),
    });
}

export interface PlanInput {
    key?: string;
    name?: string;
    db_tier?: string;
    is_default?: boolean;
    limits?: Record<string, number>;
}

export function useSavePlan() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, input }: { id?: number; input: PlanInput }) =>
            id
                ? platformSend<Envelope<Plan>>("PATCH", `plans/${id}`, input).then((r) => r.data)
                : platformSend<Envelope<Plan>>("POST", "plans", input).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
    });
}
