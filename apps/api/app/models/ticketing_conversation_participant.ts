import { TicketingConversationParticipantSchema } from "#database/schema";

/** A requester/assignee/watcher on a conversation (any actor kind). */
export default class TicketingConversationParticipant extends TicketingConversationParticipantSchema {
    static table = "ticketing_conversation_participants";
}
