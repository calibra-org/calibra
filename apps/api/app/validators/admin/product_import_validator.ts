import vine from "@vinejs/vine";

/**
 * Validators for the admin product-importer endpoints. Every body shape lives here so the
 * controller is a thin wrapper, and the named exports double as `Awaited<ReturnType<...>>` type
 * sources for the runner.
 */

/**
 * Mapping JSON: `{ csv_header: field_key | null }`. We can't constrain the field-key set tightly
 * at the validator layer (it's enumerated in `@calibra/shared/import-fields`); the runner does the
 * deep validation against the catalogue and emits a per-row error if a header maps to an unknown
 * field.
 */
const mappingValidator = vine.record(vine.string().trim().maxLength(64).nullable()).maxLength(500);

/**
 * `POST /api/v1/admin/products/import/upload` — multipart body. The file field is validated by
 * `request.file(...)` in the controller (Adonis' bodyparser handles size + extension), so this
 * schema only covers the form-encoded options that ride alongside.
 */
export const uploadImportValidator = vine.compile(
    vine.object({
        delimiter: vine.enum([",", ";", "\t", "auto"] as const).optional(),
        encoding: vine.enum(["utf-8", "windows-1256", "auto"] as const).optional(),
    }),
);

/**
 * `POST /api/v1/admin/products/import/preview` — dry-run pass over the uploaded file. The runner
 * uses the mapping to project rows into ProductDTOs but rolls back the transaction at the end so
 * the operator can edit + re-preview without consuming a real import slot.
 */
export const previewImportValidator = vine.compile(
    vine.object({
        import_id: vine.number().positive(),
        mapping: mappingValidator,
        update_existing: vine.boolean().optional(),
    }),
);

/**
 * `POST /api/v1/admin/products/import/start` — kick off the real run. Same shape as preview plus
 * an optional `save_preset` flag (with a display name) that persists the mapping as a named preset
 * keyed by the file's header-hash, so future uploads with the same shape auto-apply it.
 */
export const startImportValidator = vine.compile(
    vine.object({
        import_id: vine.number().positive(),
        mapping: mappingValidator,
        update_existing: vine.boolean().optional(),
        save_preset: vine.boolean().optional(),
        preset_name: vine.string().trim().minLength(1).maxLength(200).optional(),
    }),
);

/**
 * `POST /api/v1/admin/products/import/{job_id}/retry-row` — re-run a single failed row with the
 * operator-edited value. The `value` is the new column-cell value; the rest of the row is
 * reconstructed from the stored error metadata. `value` can be `null` to indicate "leave this
 * column out" (operator chose to clear the field).
 */
export const retryRowValidator = vine.compile(
    vine.object({
        error_id: vine.number().positive(),
        value: vine.string().trim().maxLength(4000).nullable(),
    }),
);

/**
 * `POST /api/v1/admin/products/import/{job_id}/retry-failed` — bulk re-run all error rows with the
 * operator's edited values. Each entry references the original `error_id` so we know which row
 * we're patching.
 */
export const retryFailedValidator = vine.compile(
    vine.object({
        edits: vine.array(
            vine.object({
                error_id: vine.number().positive(),
                value: vine.string().trim().maxLength(4000).nullable(),
            }),
        ),
    }),
);

/**
 * `GET /api/v1/admin/products/import/history` — paginated list. Filter params mirror the screen.
 */
export const importHistoryQueryValidator = vine.compile(
    vine.object({
        page: vine.number().positive().optional(),
        per_page: vine.number().range([1, 200]).optional(),
        status: vine
            .enum([
                "queued",
                "validating",
                "running",
                "completed",
                "completed_with_errors",
                "failed",
                "cancelled",
                "rolled_back",
            ] as const)
            .optional(),
        user_id: vine.number().positive().optional(),
        preset_id: vine.number().positive().optional(),
        from: vine.string().trim().optional(),
        to: vine.string().trim().optional(),
    }),
);

/**
 * `GET /api/v1/admin/products/import/{job_id}/errors` — optional row + severity filtering.
 */
export const errorsQueryValidator = vine.compile(
    vine.object({
        severity: vine.enum(["error", "warning"] as const).optional(),
        include_resolved: vine.boolean().optional(),
    }),
);
