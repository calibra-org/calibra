import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "media";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.string("kind", 16).notNullable();
            table.string("url", 1024).notNullable();
            table.string("mime", 128).nullable();
            table.integer("width").nullable();
            table.integer("height").nullable();
            table.bigInteger("size_bytes").nullable();
            table.string("alt", 512).nullable();
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
        });

        this.schema.raw(`ALTER TABLE "${this.tableName}" ADD CONSTRAINT "media_kind_check" CHECK (kind IN ('image', 'file'))`);
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
