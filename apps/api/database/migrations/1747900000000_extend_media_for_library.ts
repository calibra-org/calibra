import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Extends the `media` table with the editable metadata a real media library needs (display
 * title, original filename, caption, description) plus a back-reference to the user who
 * uploaded the file. Every column is nullable so existing seeded rows (Picsum URLs with no
 * filename / no uploader) remain valid; the controller fills the fields in on first upload and
 * computes the on-the-fly filename from the URL when the column is `NULL`.
 */
export default class extends BaseSchema {
    protected tableName = "media";

    async up() {
        this.schema.alterTable(this.tableName, (table) => {
            table.string("title", 512).nullable();
            table.string("filename", 512).nullable();
            table.text("caption").nullable();
            table.text("description").nullable();
            table.bigInteger("uploaded_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.index("uploaded_by_user_id", "media_uploaded_by_idx");
            table.index("created_at", "media_created_at_idx");
        });
    }

    async down() {
        this.schema.alterTable(this.tableName, (table) => {
            table.dropIndex("created_at", "media_created_at_idx");
            table.dropIndex("uploaded_by_user_id", "media_uploaded_by_idx");
            table.dropColumn("uploaded_by_user_id");
            table.dropColumn("description");
            table.dropColumn("caption");
            table.dropColumn("filename");
            table.dropColumn("title");
        });
    }
}
