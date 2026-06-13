import { TicketingInboxMemberSchema } from "#database/schema";

/** Join row granting an agent membership of an inbox. */
export default class TicketingInboxMember extends TicketingInboxMemberSchema {
    static table = "ticketing_inbox_members";
}
