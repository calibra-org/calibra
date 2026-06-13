import { TicketingTagSchema } from "#database/schema";

/** A per-tenant conversation label. */
export default class TicketingTag extends TicketingTagSchema {
    static table = "ticketing_tags";
}
