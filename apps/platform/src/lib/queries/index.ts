"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { platformGet, platformSend } from "#/lib/api-client";
import type {
    AuditEvent,
    MetricsRange,
    Operator,
    OperatorCredentialReveal,
    Overview,
    OwnerCredentials,
    Paginated,
    Plan,
    TenantDetail,
    TenantListItem,
    TenantMetrics,
} from "#/lib/types";

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
            platformSend<Envelope<TenantDetail & { shop_url: string; owner_credentials: OwnerCredentials }>>(
                "POST",
                "tenants",
                input,
            ).then((r) => r.data),
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

/** Targeted impersonation now requires the chosen operator + a reason (both enforced server-side). */
export interface ImpersonateInput {
    targetUserId: number;
    reason: string;
}

export function useImpersonate(id: number | string) {
    return useMutation({
        mutationFn: (input: ImpersonateInput) =>
            platformSend<Envelope<{ token: { value: string }; admin_url: string }>>("POST", `tenants/${id}/impersonate`, {
                target_user_id: input.targetUserId,
                reason: input.reason,
            }).then((r) => r.data),
    });
}

/**
 * Impersonation grant where the tenant id is the mutate variable rather than baked into the hook.
 * The command palette acts on arbitrary shops it can't enumerate as fixed hooks, so it needs the
 * id at call time. Row-/detail-level call sites keep using the id-bound {@link useImpersonate}.
 */
export function useImpersonateTenant() {
    return useMutation({
        mutationFn: ({ id, targetUserId, reason }: ImpersonateInput & { id: number | string }) =>
            platformSend<Envelope<{ token: { value: string }; admin_url: string }>>("POST", `tenants/${id}/impersonate`, {
                target_user_id: targetUserId,
                reason,
            }).then((r) => r.data),
    });
}

/** Operators of a tenant (admins incl. the store owner) with server-computed capabilities. */
export function useOperators(id: number | string) {
    return useQuery({
        queryKey: ["operators", String(id)],
        queryFn: () => platformGet<Envelope<Operator[]>>(`tenants/${id}/operators`).then((r) => r.data),
    });
}

export interface CreateOperatorInput {
    email: string;
    handoff?: boolean;
}

export function useCreateOperator(id: number | string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateOperatorInput) =>
            platformSend<{ data: Operator; credentials: OperatorCredentialReveal }>(
                "POST",
                `tenants/${id}/operators`,
                input,
            ),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["operators", String(id)] }),
    });
}

export function useDisableOperator(id: number | string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (userId: number) => platformSend<Envelope<Operator>>("PATCH", `tenants/${id}/operators/${userId}/disable`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["operators", String(id)] }),
    });
}

export function useEnableOperator(id: number | string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (userId: number) => platformSend<Envelope<Operator>>("PATCH", `tenants/${id}/operators/${userId}/enable`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["operators", String(id)] }),
    });
}

export function useRemoveOperator(id: number | string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (userId: number) => platformSend("DELETE", `tenants/${id}/operators/${userId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["operators", String(id)] }),
    });
}

export function useMakeOwner(id: number | string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (userId: number) =>
            platformSend<Envelope<Operator>>("POST", `tenants/${id}/operators/${userId}/make-owner`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["operators", String(id)] });
            qc.invalidateQueries({ queryKey: ["tenant", String(id)] });
        },
    });
}

export function useResetOperatorPassword(id: number | string) {
    return useMutation({
        mutationFn: (userId: number) =>
            platformSend<Envelope<{ temp_password: string; must_change_password: boolean }>>(
                "POST",
                `tenants/${id}/operators/${userId}/reset-password`,
            ).then((r) => r.data),
    });
}

export function useOperatorHandoffLink(id: number | string) {
    return useMutation({
        mutationFn: (userId: number) =>
            platformSend<Envelope<{ handoff_url: string; expires_at: string }>>(
                "POST",
                `tenants/${id}/operators/${userId}/handoff-link`,
            ).then((r) => r.data),
    });
}

/** Control-plane audit feed, optionally scoped to one tenant. */
export function useAudit(tenantId?: number | string) {
    return useQuery({
        queryKey: ["audit", tenantId ? String(tenantId) : "all"],
        queryFn: () => platformGet<Paginated<AuditEvent>>(`audit${tenantId ? `?tenant_id=${tenantId}` : ""}`),
    });
}

/** Suspend / activate any tenant by id — the palette's lifecycle command. Invalidates list + detail. */
export function useSetTenantStatus() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, status }: { id: number | string; status: string }) =>
            platformSend<Envelope<TenantDetail>>("PATCH", `tenants/${id}`, { status }).then((r) => r.data),
        onSuccess: (_data, { id }) => {
            qc.invalidateQueries({ queryKey: ["tenant", String(id)] });
            qc.invalidateQueries({ queryKey: ["tenants"] });
            qc.invalidateQueries({ queryKey: ["overview"] });
        },
    });
}

/**
 * Open an impersonation grant in a new admin tab (shared by rows, detail header, and the palette).
 * Targets the admin's `/api/impersonate` hand-off route, which exchanges the token for an
 * `admin_session` cookie and redirects into the dashboard — so the operator lands logged-in, not
 * on the login screen.
 */
export function openImpersonationTab(grant: { token: { value: string }; admin_url: string }): void {
    const url = new URL("/api/impersonate", grant.admin_url);
    url.searchParams.set("token", grant.token.value);
    window.open(url.toString(), "_blank", "noopener");
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
