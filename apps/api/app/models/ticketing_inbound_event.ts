import { TicketingInboundEventSchema } from "#database/schema";

/** Tenant-scoped inbound dedup ledger (R3) — distinct from the PSP processed_webhook_events. */
export default class TicketingInboundEvent extends TicketingInboundEventSchema {
    static table = "ticketing_inbound_events";
}
