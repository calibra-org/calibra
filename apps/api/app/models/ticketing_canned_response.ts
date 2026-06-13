import { TicketingCannedResponseSchema } from "#database/schema";

/** A reusable canned reply keyed by a per-tenant shortcut. */
export default class TicketingCannedResponse extends TicketingCannedResponseSchema {
    static table = "ticketing_canned_responses";
}
