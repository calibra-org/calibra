import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { TicketingAttachmentSchema } from "#database/schema";
import Media from "#models/media";
import TicketingMessage from "#models/ticketing_message";

/** A media row (image/file in v1) bound to a message. */
export default class TicketingAttachment extends TicketingAttachmentSchema {
    static table = "ticketing_attachments";

    @belongsTo(() => TicketingMessage, { foreignKey: "messageId" })
    declare message: BelongsTo<typeof TicketingMessage>;

    @belongsTo(() => Media, { foreignKey: "mediaId" })
    declare media: BelongsTo<typeof Media>;
}
