"use client";

import type { AdminSchemas } from "@calibra/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

export type Operator = AdminSchemas["schemas"]["Operator"];
export type OperatorCredentialReveal = AdminSchemas["schemas"]["OperatorCredentialReveal"];

const KEY = (locale: string) => ["admin", "operators", { locale }] as const;

/** Team operators (owner-gated mutations enforced server-side; capabilities drive the UI). */
export function useAdminOperators() {
    const locale = useLocale();
    return useQuery({
        queryKey: KEY(locale),
        queryFn: ({ signal }) => apiGet<{ data: Operator[] }>("operators", { locale, signal }),
        select: (res) => res.data,
    });
}

function useInvalidate() {
    const locale = useLocale();
    const qc = useQueryClient();
    return () => qc.invalidateQueries({ queryKey: KEY(locale) });
}

export function useCreateAdminOperator() {
    const locale = useLocale();
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: (body: { email: string; handoff?: boolean }) =>
            apiMutate<{ data: Operator; credentials: OperatorCredentialReveal }>("POST", "operators", { locale, body }),
        onSuccess: invalidate,
    });
}

export function useDisableAdminOperator() {
    const locale = useLocale();
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: (id: number) => apiMutate<{ data: Operator }>("PATCH", `operators/${id}/disable`, { locale }),
        onSuccess: invalidate,
    });
}

export function useEnableAdminOperator() {
    const locale = useLocale();
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: (id: number) => apiMutate<{ data: Operator }>("PATCH", `operators/${id}/enable`, { locale }),
        onSuccess: invalidate,
    });
}

export function useRemoveAdminOperator() {
    const locale = useLocale();
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: (id: number) => apiMutate<{ data: { removed: boolean } }>("DELETE", `operators/${id}`, { locale }),
        onSuccess: invalidate,
    });
}

export function useMakeAdminOwner() {
    const locale = useLocale();
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: (id: number) => apiMutate<{ data: Operator }>("POST", `operators/${id}/make-owner`, { locale }),
        onSuccess: invalidate,
    });
}

export function useResetAdminOperatorPassword() {
    const locale = useLocale();
    return useMutation({
        mutationFn: (id: number) =>
            apiMutate<{ data: { temp_password: string; must_change_password: boolean } }>(
                "POST",
                `operators/${id}/reset-password`,
                { locale },
            ),
    });
}

export function useAdminOperatorHandoffLink() {
    const locale = useLocale();
    return useMutation({
        mutationFn: (id: number) =>
            apiMutate<{ data: { handoff_url: string; expires_at: string } }>("POST", `operators/${id}/handoff-link`, {
                locale,
            }),
    });
}
