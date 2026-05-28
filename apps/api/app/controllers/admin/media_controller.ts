import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import vine from "@vinejs/vine";
import { DateTime } from "luxon";

import Media from "#models/media";
import { deleteFile, save } from "#services/media_storage";
import { adminMediaView } from "#table_views/admin/media";
import { collection, resource } from "#transformers/api_envelope";
import MediaTransformer from "#transformers/media_transformer";
import { updateMediaValidator } from "#validators/admin/media_validator";

/** Strict mode: declares the bespoke top-level extras that don't fit per-column filtering
 * (`q` is multi-column ILIKE; `type` is a MIME-group keyword; `month` is a YYYY-MM window;
 * `uploaded_by` is a controller-side scope). Default page size is 60 (the media grid's natural
 * row count — ~5 rows of 12 cards). */
const adminMediaListValidator = adminMediaView.compileStrict({
    extras: {
        q: vine.string().trim().maxLength(120).optional(),
        type: vine.string().trim().maxLength(40).optional(),
        month: vine
            .string()
            .trim()
            .regex(/^\d{4}-\d{2}$/)
            .optional(),
        uploaded_by: vine.number().positive().optional(),
    },
    defaultLimit: 60,
});

/** Maps the WordPress-style filter token to a Postgres-friendly MIME prefix check. */
const MIME_GROUPS = {
    image: { likeAny: ["image/%"] },
    audio: { likeAny: ["audio/%"] },
    video: { likeAny: ["video/%"] },
    document: {
        likeAny: [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/rtf",
            "text/plain",
            "text/markdown",
            "text/html",
        ],
    },
    spreadsheet: {
        likeAny: [
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/csv",
            "application/vnd.oasis.opendocument.spreadsheet",
        ],
    },
    archive: {
        likeAny: [
            "application/zip",
            "application/x-rar-compressed",
            "application/x-7z-compressed",
            "application/x-tar",
            "application/gzip",
            "application/x-bzip2",
        ],
    },
} as const;

type FilterType = keyof typeof MIME_GROUPS | "unattached" | "mine" | "all";

/**
 * Admin media library controller. Powers `/api/v1/admin/media`. The listing supports the same
 * filters the WordPress media library does (type, month, search, attached, "mine") so the
 * frontend workbench can hand the URL string straight through without client-side post-filtering.
 *
 * Uploads land on the local disk via {@link save} from {@link "#services/media_storage"}; the row
 * stores the absolute URL so `<img src>` consumers (admin grid, downstream brand/category
 * inspectors) don't have to know about the backend's storage layout.
 */
export default class AdminMediaController {
    /** `GET /api/v1/admin/media` — paginated listing with filters. */
    async index(ctx: HttpContext) {
        const { request, auth } = ctx;
        const parsed = await adminMediaListValidator.validate(request.qs());

        const query = Media.query();

        const type = String(request.input("type", "all")) as FilterType;
        if (type === "unattached") {
            query.whereNotIn("id", (sub) => sub.select("media_id").from("product_images"));
        } else if (type === "mine") {
            const userId = auth.user?.id;
            if (userId !== undefined) query.where("uploaded_by_user_id", Number(userId));
            else query.whereRaw("1 = 0");
        } else if (type in MIME_GROUPS) {
            const group = MIME_GROUPS[type as keyof typeof MIME_GROUPS];
            query.where((sub) => {
                for (const pattern of group.likeAny) sub.orWhere("mime", "like", pattern);
            });
        }

        const month = String(request.input("month", "")).trim();
        const monthMatch = /^(\d{4})-(\d{2})$/.exec(month);
        if (monthMatch !== null) {
            const yyyy = Number(monthMatch[1]);
            const mm = Number(monthMatch[2]);
            const start = DateTime.utc(yyyy, mm, 1);
            if (start.isValid) {
                const end = start.plus({ months: 1 });
                query.where("created_at", ">=", start.toISO()).where("created_at", "<", end.toISO());
            }
        }

        const q = String(request.input("q", "")).trim();
        if (q.length > 0) {
            const needle = `%${q.toLowerCase()}%`;
            query.where((sub) => {
                sub.whereRaw("LOWER(filename) like ?", [needle])
                    .orWhereRaw("LOWER(title) like ?", [needle])
                    .orWhereRaw("LOWER(alt) like ?", [needle])
                    .orWhereRaw("LOWER(url) like ?", [needle]);
            });
        }

        const uploadedBy = Number(request.input("uploaded_by", 0));
        if (Number.isFinite(uploadedBy) && uploadedBy > 0) {
            query.where("uploaded_by_user_id", uploadedBy);
        }

        const { data: rows, meta } = await adminMediaView.run<Media>(query, parsed);
        const { data } = await collection<unknown>(MediaTransformer.transform(rows));
        return { data, meta };
    }

    /** `GET /api/v1/admin/media/months` — distinct `YYYY-MM` buckets, for the date dropdown. */
    async months(_ctx: HttpContext) {
        const rows = await db.rawQuery(
            `SELECT DISTINCT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month
             FROM media
             ORDER BY month DESC`,
        );
        const list = ((rows.rows ?? rows) as Array<{ month: string }>)
            .map((row) => row.month)
            .filter((m) => /^\d{4}-\d{2}$/.test(m));
        return { data: list };
    }

    /** `GET /api/v1/admin/media/{id}` — single media row. */
    async show(ctx: HttpContext) {
        const row = await Media.find(ctx.params.id);
        if (!row) return ctx.response.status(404).json({ errors: [{ message: "Media not found", code: "E_NOT_FOUND" }] });
        return resource(MediaTransformer.transform(row));
    }

    /** `POST /api/v1/admin/media` — multipart upload. The single field name is `file`. */
    async store(ctx: HttpContext) {
        const { request, response, auth } = ctx;
        const file = request.file("file", { size: "20mb" });
        if (file === null) {
            return response.status(422).json({
                errors: [{ message: "file field is required", rule: "required", field: "file" }],
            });
        }
        if (!file.isValid) {
            return response.status(422).json({
                errors: (file.errors ?? []).map((err) => ({
                    message: err.message,
                    rule: err.type,
                    field: err.fieldName,
                })),
            });
        }

        const host = request.host() ?? "localhost";
        const saved = await save(file, { host, protocol: request.protocol() });

        const row = new Media();
        row.kind = saved.kind;
        row.url = saved.url;
        row.mime = saved.mime;
        row.sizeBytes = saved.sizeBytes;
        row.filename = saved.filename;
        row.title = saved.filename;
        row.alt = null;
        row.caption = null;
        row.description = null;
        row.width = null;
        row.height = null;
        row.attributes = {};
        if (auth.user) row.uploadedByUserId = Number(auth.user.id);
        await row.save();

        response.status(201);
        return resource(MediaTransformer.transform(row));
    }

    /** `PATCH /api/v1/admin/media/{id}` — title / alt / caption / description / filename. */
    async update(ctx: HttpContext) {
        const row = await Media.find(ctx.params.id);
        if (!row) return ctx.response.status(404).json({ errors: [{ message: "Media not found", code: "E_NOT_FOUND" }] });

        const payload = await ctx.request.validateUsing(updateMediaValidator);
        if (payload.title !== undefined) row.title = payload.title;
        if (payload.alt !== undefined) row.alt = payload.alt;
        if (payload.caption !== undefined) row.caption = payload.caption;
        if (payload.description !== undefined) row.description = payload.description;
        if (payload.filename !== undefined) row.filename = payload.filename;
        await row.save();

        return resource(MediaTransformer.transform(row));
    }

    /** `DELETE /api/v1/admin/media/{id}` — drop the row + best-effort delete the file on disk. */
    async destroy(ctx: HttpContext) {
        const row = await Media.find(ctx.params.id);
        if (!row) return ctx.response.status(404).json({ errors: [{ message: "Media not found", code: "E_NOT_FOUND" }] });
        const url = row.url;
        await row.delete();
        await deleteFile(url);
        return ctx.response.status(204);
    }
}
