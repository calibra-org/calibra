import type { AdminSchemas } from "@calibra/sdk";

import type {
    AdminCustomer,
    AdminCustomerCounts,
    AdminCustomerMarketingHistory,
    AdminCustomerMarketingPrefs,
    AdminCustomerNote,
    AdminCustomerSegment,
    AdminCustomerStatsDetail,
    AdminCustomerStatus,
    AdminCustomerStatusHistory,
    AdminCustomerTagRow,
    AdminCustomerTimelineEntry,
    MoneyMinor,
} from "#/lib/types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminCustomer = Schemas["AdminCustomer"];

/**
 * SDK `AdminCustomer` → admin view `AdminCustomer`. Shared between server-repos (initial paint of
 * server-rendered customer pages) and lib/queries/customers.ts (client-side list + detail hooks).
 * The lifetime-stats fields are populated when the API call includes `include_stats=1`; with the
 * flag off, the server returns zeros and the table renders dashes.
 */
export function toAdminCustomer(c: SdkAdminCustomer): AdminCustomer {
    const iran = c.profile_extensions?.iran;
    const numericUserId = c.user?.id !== undefined ? Number(c.user.id) : null;
    return {
        id: Number(c.id),
        userId: numericUserId,
        firstName: c.first_name ?? "",
        lastName: c.last_name ?? "",
        email: c.user?.email ?? "",
        phone: c.phone ?? "",
        nationalId: iran?.national_id ?? null,
        companyName: iran?.legal_company_name_fa ?? null,
        isPayingCustomer: Boolean(c.is_paying_customer),
        status: ((c as { status?: AdminCustomerStatus }).status ?? "active") as AdminCustomerStatus,
        hasAccount: numericUserId !== null,
        emailVerified: false,
        acquisitionChannel: (c as { acquisition_channel?: string | null }).acquisition_channel ?? null,
        lastSeenAt: (c as { last_seen_at?: string | null }).last_seen_at ?? null,
        tags: ((c as { tags?: string[] }).tags ?? []).slice(),
        ordersCount: Number((c as { lifetime_order_count?: number }).lifetime_order_count ?? 0),
        totalSpent: Number((c as { lifetime_spend_minor?: number }).lifetime_spend_minor ?? 0) as MoneyMinor,
        averageOrderValue: Number((c as { average_order_value_minor?: number }).average_order_value_minor ?? 0) as MoneyMinor,
        lastOrderAt: (c as { last_order_at?: string | null }).last_order_at ?? null,
        firstOrderAt: (c as { first_order_at?: string | null }).first_order_at ?? null,
        daysSinceLastOrder: (c as { days_since_last_order?: number | null }).days_since_last_order ?? null,
        addressesCount: Number((c as { addresses_count?: number | null }).addresses_count ?? 0),
        notesCount: Number((c as { notes_count?: number | null }).notes_count ?? 0),
        createdAt: c.created_at ?? new Date().toISOString(),
        addresses: [],
        downloads: [],
    };
}

interface CountsEnvelope {
    all: number;
    account_holders: number;
    guest: number;
    big_spenders: number;
    new_30d: number;
    inactive_180d: number;
    no_address: number;
    trashed: number;
    summary: {
        avg_order_count: number;
        avg_lifetime_spend_minor: number;
        avg_aov_minor: number;
        pct_with_account: number;
    };
}

export function toAdminCustomerCounts(payload: CountsEnvelope): AdminCustomerCounts {
    return {
        all: payload.all,
        accountHolders: payload.account_holders,
        guest: payload.guest,
        bigSpenders: payload.big_spenders,
        new30d: payload.new_30d,
        inactive180d: payload.inactive_180d,
        noAddress: payload.no_address,
        trashed: payload.trashed,
        summary: {
            avgOrderCount: payload.summary.avg_order_count,
            avgLifetimeSpend: payload.summary.avg_lifetime_spend_minor as MoneyMinor,
            avgAov: payload.summary.avg_aov_minor as MoneyMinor,
            pctWithAccount: payload.summary.pct_with_account,
        },
    };
}

interface StatsEnvelope {
    lifetime_order_count: number;
    lifetime_spend_minor: number;
    average_order_value_minor: number;
    last_order_at: string | null;
    first_order_at: string | null;
    days_since_last_order: number | null;
    monthly_spend_series: { month: string; amount_minor: number }[];
    favorite_product_id: number | null;
}

export function toAdminCustomerStats(payload: StatsEnvelope): AdminCustomerStatsDetail {
    return {
        lifetimeOrderCount: payload.lifetime_order_count,
        lifetimeSpend: payload.lifetime_spend_minor as MoneyMinor,
        averageOrderValue: payload.average_order_value_minor as MoneyMinor,
        lastOrderAt: payload.last_order_at,
        firstOrderAt: payload.first_order_at,
        daysSinceLastOrder: payload.days_since_last_order,
        monthlySpendSeries: payload.monthly_spend_series.map((m) => ({
            month: m.month,
            amount: m.amount_minor as MoneyMinor,
        })),
        favoriteProductId: payload.favorite_product_id,
    };
}

interface NoteEnvelope {
    id: string;
    customer_id: string;
    body: string;
    author: { id: string; email: string } | null;
    author_user_id: string | null;
    created_at: string | null;
    updated_at: string | null;
}

export function toAdminCustomerNote(n: NoteEnvelope): AdminCustomerNote {
    return {
        id: Number(n.id),
        customerId: Number(n.customer_id),
        body: n.body,
        authorId: n.author?.id ? Number(n.author.id) : null,
        authorEmail: n.author?.email ?? null,
        createdAt: n.created_at ?? "",
        updatedAt: n.updated_at ?? "",
    };
}

interface TagEnvelope {
    id: string;
    name: string;
    created_at: string | null;
}

export function toAdminCustomerTag(t: TagEnvelope): AdminCustomerTagRow {
    return {
        id: Number(t.id),
        name: t.name,
        createdAt: t.created_at,
    };
}

interface SegmentEnvelope {
    id: string;
    name: string;
    filters: Record<string, unknown>;
    is_pinned: boolean;
    created_at: string | null;
    updated_at: string | null;
    last_used_at: string | null;
}

export function toAdminCustomerSegment(s: SegmentEnvelope): AdminCustomerSegment {
    return {
        id: Number(s.id),
        name: s.name,
        filters: s.filters ?? {},
        isPinned: s.is_pinned,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        lastUsedAt: s.last_used_at,
    };
}

interface MarketingPrefsEnvelope {
    email_opt_in: boolean;
    email_opt_in_at: string | null;
    email_opt_in_source: string | null;
    sms_opt_in: boolean;
    sms_opt_in_at: string | null;
    sms_opt_in_source: string | null;
    phone_call_opt_in: boolean;
    phone_call_opt_in_at: string | null;
    phone_call_opt_in_source: string | null;
    updated_at: string | null;
}

export function toAdminCustomerMarketingPrefs(p: MarketingPrefsEnvelope): AdminCustomerMarketingPrefs {
    return {
        emailOptIn: p.email_opt_in,
        emailOptInAt: p.email_opt_in_at,
        emailOptInSource: p.email_opt_in_source,
        smsOptIn: p.sms_opt_in,
        smsOptInAt: p.sms_opt_in_at,
        smsOptInSource: p.sms_opt_in_source,
        phoneCallOptIn: p.phone_call_opt_in,
        phoneCallOptInAt: p.phone_call_opt_in_at,
        phoneCallOptInSource: p.phone_call_opt_in_source,
        updatedAt: p.updated_at,
    };
}

interface MarketingHistoryEnvelope {
    id: string;
    channel: "email" | "sms" | "phone";
    opted_in: boolean;
    source: string | null;
    actor: { id: string; email: string } | null;
    occurred_at: string | null;
}

export function toAdminCustomerMarketingHistory(h: MarketingHistoryEnvelope): AdminCustomerMarketingHistory {
    return {
        id: Number(h.id),
        channel: h.channel,
        optedIn: h.opted_in,
        source: h.source,
        actorEmail: h.actor?.email ?? null,
        occurredAt: h.occurred_at ?? "",
    };
}

interface StatusHistoryEnvelope {
    id: string;
    from_status: AdminCustomerStatus | null;
    to_status: AdminCustomerStatus;
    reason: string | null;
    actor: { id: string; email: string } | null;
    occurred_at: string | null;
}

export function toAdminCustomerStatusHistory(h: StatusHistoryEnvelope): AdminCustomerStatusHistory {
    return {
        id: Number(h.id),
        fromStatus: h.from_status,
        toStatus: h.to_status,
        reason: h.reason,
        actorEmail: h.actor?.email ?? null,
        occurredAt: h.occurred_at ?? "",
    };
}

interface TimelineEnvelope {
    kind: AdminCustomerTimelineEntry["kind"];
    occurred_at: string;
    payload?: Record<string, unknown>;
    actor: { id: string; email: string } | null;
}

export function toAdminCustomerTimeline(rows: TimelineEnvelope[]): AdminCustomerTimelineEntry[] {
    return rows.map((r) => ({
        kind: r.kind,
        occurredAt: r.occurred_at,
        payload: r.payload ?? {},
        actor: r.actor,
    }));
}
