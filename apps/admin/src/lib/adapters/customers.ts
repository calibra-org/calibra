import type { AdminSchemas } from "@calibra/sdk";

import type { AdminCustomer, MoneyMinor } from "#/lib/types";

/**
 * SDK `AdminCustomer` → admin view `AdminCustomer`. Shared between server-repos (initial paint of
 * server-rendered customer pages) and lib/queries/customers.ts (client-side list + detail hooks).
 */
type Schemas = AdminSchemas["schemas"];
type SdkAdminCustomer = Schemas["AdminCustomer"];

export function toAdminCustomer(c: SdkAdminCustomer): AdminCustomer {
    const iran = c.profile_extensions?.iran;
    return {
        id: Number(c.id),
        userId: c.user?.id !== undefined ? Number(c.user.id) : null,
        firstName: c.first_name ?? "",
        lastName: c.last_name ?? "",
        email: c.user?.email ?? "",
        phone: c.phone ?? "",
        nationalId: iran?.national_id ?? null,
        companyName: iran?.legal_company_name_fa ?? null,
        isPayingCustomer: Boolean(c.is_paying_customer),
        ordersCount: 0,
        totalSpent: 0 as MoneyMinor,
        lastOrderAt: null,
        createdAt: c.created_at ?? new Date().toISOString(),
        addresses: [],
        downloads: [],
    };
}
