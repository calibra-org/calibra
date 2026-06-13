import type { TransactionClientContract } from "@adonisjs/lucid/types/database";

import { currentTenantId, currentTrx } from "#services/tenant_context";

/**
 * The R5 fork point. The `ticketing_*` schema and the conversation/message logic are SHARED across
 * two contexts; only identity + isolation + channels differ. A `ConversationContext` bundles those
 * differences so `conversation_service` runs one core regardless of caller:
 *
 *  - **shop** (`/api/v1/admin/tickets`, `/api/v1/admin/support`): runs on the request transaction
 *    (`calibra_app`, RLS-enforced) with the tenant from request context; actors are tenant `users`;
 *    `context = shop_customer` (agent inbox) or `platform_internal` (shop ↔ Calibra).
 *  - **platform** (`/api/v1/platform/tickets`): runs on a `postgres_admin` (BYPASSRLS) transaction
 *    the caller opens, with an EXPLICIT `tenant_id` filter (R1, test-asserted); actors are global
 *    `platform_users`; `context = platform_internal` only.
 *
 * Both paths still write/read with an explicit `tenant_id` (= `tenantId`), so the shop path is
 * belt-and-suspenders (RLS + explicit) and the platform path is correct-by-construction.
 */
export type ConversationContextKind = "shop" | "platform";
export type ConversationKindValue = "shop_customer" | "platform_internal";

export interface ConversationContext {
    kind: ConversationContextKind;
    /** The `ticketing_conversations.context` value for conversations created/scoped here. */
    contextValue: ConversationKindValue;
    /** Transaction every read/write rides — the request trx (shop) or an admin trx (platform). */
    trx: TransactionClientContract;
    /** Explicit tenant id for `WHERE tenant_id` filters + insert stamping. */
    tenantId: bigint;
    agentIdentity: "user" | "platform_user";
    channels: "internal+external" | "internal_only";
}

/**
 * Shop context — rides the per-request tenant transaction (RLS) with the tenant from context. Pass
 * `platform_internal` for the shop-admin → Calibra surface; defaults to the agent inbox.
 */
export function shopContext(contextValue: ConversationKindValue = "shop_customer"): ConversationContext {
    return {
        kind: "shop",
        contextValue,
        trx: currentTrx(),
        tenantId: currentTenantId(),
        agentIdentity: "user",
        channels: "internal+external",
    };
}

/**
 * Platform (control-plane) context — the caller opens a `postgres_admin` transaction and supplies
 * the conversation's tenant id so every query carries an explicit `tenant_id` (R1). Only the
 * `platform_internal` audience is reachable here; external channels are never platform-visible.
 */
export function platformContext(trx: TransactionClientContract, tenantId: bigint): ConversationContext {
    return {
        kind: "platform",
        contextValue: "platform_internal",
        trx,
        tenantId,
        agentIdentity: "platform_user",
        channels: "internal_only",
    };
}
