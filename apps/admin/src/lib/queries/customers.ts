"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { toAdminCustomer } from "#/lib/adapters/customers";
import { apiGet } from "#/lib/queries/api-client";
import type { AdminCustomer, Paginated } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];

interface CustomerListEnvelope {
    data: Schemas["AdminCustomer"][];
    meta?: { page: number; perPage: number; total: number; lastPage: number };
}

export interface CustomersListParams {
    page?: number;
    perPage?: number;
    search?: string;
}

export function useCustomersList(params: CustomersListParams = {}) {
    const locale = useLocale() as Locale;
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 20;
    const search = params.search;
    return useQuery<CustomerListEnvelope, Error, Paginated<AdminCustomer>>({
        queryKey: ["admin", "customers", "list", { locale, page, perPage, search }],
        queryFn: () => apiGet<CustomerListEnvelope>("customers", { locale, query: { page, perPage, search } }),
        select: (payload) => ({
            data: (payload.data ?? []).map(toAdminCustomer),
            meta: payload.meta ?? { page, perPage, total: payload.data?.length ?? 0, lastPage: 1 },
        }),
    });
}
