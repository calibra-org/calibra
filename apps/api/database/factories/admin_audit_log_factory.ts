import factory from "@adonisjs/lucid/factories";
import { DateTime } from "luxon";

import AdminAuditLog from "#models/admin_audit_log";
import { testTenantId } from "#tests/helpers/tenant";

let counter = 0;

/**
 * Plain admin-audit-log builder. Defaults to a `null` actor (system action) and a
 * synthetic entity reference so callers can stamp specifics via `.merge({...})`.
 * `.state("forCustomer", row)` is a convenience for the most-common entity kind.
 */
export const AdminAuditLogFactory = factory
    .define(AdminAuditLog, async () => {
        counter += 1;
        return {
            tenantId: await testTenantId(),
            actorUserId: null,
            action: `factory.action.${counter}`,
            entityKind: "system",
            entityId: counter,
            payload: {},
            ipAddress: null,
            occurredAt: DateTime.utc(),
        };
    })
    .state("forCustomer", (row) => {
        row.entityKind = "customer";
    })
    .state("forOrder", (row) => {
        row.entityKind = "order";
    })
    .build();
