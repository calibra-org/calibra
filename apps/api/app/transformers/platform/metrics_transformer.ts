import type { FleetOverview, TenantMetrics } from "#services/platform/fleet_metrics_service";

/** Wire shape for the fleet overview rollup (console home). */
export function toOverview(o: FleetOverview) {
    return {
        shops: o.shops,
        revenue_30d: o.revenue30d.map((r) => ({ currency_code: r.currencyCode, amount: r.amount })),
        orders_30d: o.orders30d,
        customers_total: o.customersTotal,
        storage_bytes: o.storageBytes,
    };
}

/** Wire shape for a tenant's native business metrics (KPIs + time series). */
export function toTenantMetrics(m: TenantMetrics) {
    return {
        range: m.range,
        currency_code: m.currencyCode,
        kpis: {
            revenue: m.kpis.revenue,
            orders: m.kpis.orders,
            customers_new: m.kpis.customersNew,
            customers_total: m.kpis.customersTotal,
            storage_bytes: m.kpis.storageBytes,
        },
        series: m.series.map((p) => ({
            day: p.day,
            revenue: p.revenue,
            orders: p.orders,
            new_customers: p.newCustomers,
        })),
    };
}
