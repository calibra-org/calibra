import { BaseTransformer } from "@adonisjs/core/transformers";

import type CustomerNote from "#models/customer_note";

export default class CustomerNoteTransformer extends BaseTransformer<CustomerNote> {
    toObject() {
        const author = this.resource.author ?? null;
        return {
            id: String(this.resource.id),
            customer_id: String(this.resource.customerId),
            body: this.resource.body,
            author: author
                ? {
                      id: String(author.id),
                      email: author.email,
                  }
                : null,
            author_user_id: this.resource.authorUserId === null ? null : String(this.resource.authorUserId),
            created_at: this.resource.createdAt?.toISO() ?? null,
            updated_at: this.resource.updatedAt?.toISO() ?? null,
        };
    }
}
