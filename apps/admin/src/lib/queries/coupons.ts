"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { toAdminCoupon } from "#/lib/adapters/coupons";
import { apiGet } from "#/lib/queries/api-client";
import type { AdminCoupon, Paginated } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];

interface CouponListEnvelope {
    data: Schemas["AdminCoupon"][];
    meta?: { page: number; perPage: number; total: number; lastPage: number };
}

export interface CouponsListParams {
    page?: number;
    perPage?: number;
    search?: string;
}

export function useCouponsList(params: CouponsListParams = {}) {
    const locale = useLocale() as Locale;
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 20;
    const search = params.search;
    return useQuery<CouponListEnvelope, Error, Paginated<AdminCoupon>>({
        queryKey: ["admin", "coupons", "list", { locale, page, perPage, search }],
        queryFn: () => apiGet<CouponListEnvelope>("coupons", { locale, query: { page, perPage, search } }),
        select: (payload) => ({
            data: (payload.data ?? []).map(toAdminCoupon),
            meta: payload.meta ?? { page, perPage, total: payload.data?.length ?? 0, lastPage: 1 },
        }),
    });
}
