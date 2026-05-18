import { column } from "@adonisjs/lucid/orm";

import { SettingSchema } from "#database/schema";

export type SettingValueType = "string" | "number" | "boolean" | "json";

export default class Setting extends SettingSchema {
    static table = "settings";

    /**
     * `type` is `CHAR(16)` so Postgres pads short tags with trailing spaces; trim on read so the
     * runtime value matches the {@link SettingValueType} union and string equality works as written.
     */
    @column({ consume: (value) => (typeof value === "string" ? value.trim() : value) })
    declare type: string;

    /**
     * Stored as JSONB. The pg driver auto-serializes objects and arrays but passes JS primitives
     * (strings, numbers, booleans) through unchanged, which JSONB rejects unless they're wrapped in
     * a JSON literal. Always stringify on write so `"IRR"` reaches Postgres as `"IRR"` (a JSON
     * string) rather than `IRR` (a bare identifier). Reads come back already parsed by the pg
     * driver, so `consume` is a no-op.
     */
    @column({ prepare: (value) => JSON.stringify(value) })
    declare value: unknown;
}
