import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import { DateTime } from "luxon";

import CustomerSegment from "#models/customer_segment";
import { adminCustomerSegmentsView } from "#table_views/admin/customer_segments";
import CustomerSegmentTransformer from "#transformers/customer_segment_transformer";
import { adminCustomerSegmentValidator } from "#validators/admin/customer_validator";

const adminCustomerSegmentsListValidator = adminCustomerSegmentsView.compileStrict({ defaultLimit: 100 });

export default class AdminCustomerSegmentsController {
    /** GET /api/v1/admin/customer-segments — owner-scoped; pinned first then by name. */
    async index(ctx: HttpContext) {
        const auth = await ctx.auth.authenticate();
        const parsed = await adminCustomerSegmentsListValidator.validate(ctx.request.qs());
        /** Owner-scope pre-applied as a security invariant — a forged `?filter[]=user_id:eq:N`
         * cannot read another operator's saved segments. */
        const builder = CustomerSegment.query().where("user_id", Number(auth.id));
        const { data: rows, meta } = await adminCustomerSegmentsView.run<CustomerSegment>(builder, parsed);
        return { data: rows.map((s) => new CustomerSegmentTransformer(s).toObject()), meta };
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminCustomerSegmentValidator);
        const auth = await ctx.auth.authenticate();
        const segment = await CustomerSegment.create({
            userId: Number(auth.id),
            name: payload.name,
            filters: payload.filters ?? {},
            isPinned: payload.is_pinned ?? false,
        });
        ctx.response.status(201);
        return { data: new CustomerSegmentTransformer(segment).toObject() };
    }

    async update(ctx: HttpContext) {
        const segment = await this.findOwnedOrFail(ctx);
        const payload = await ctx.request.validateUsing(adminCustomerSegmentValidator);
        segment.name = payload.name;
        segment.filters = payload.filters ?? {};
        if (payload.is_pinned !== undefined) segment.isPinned = payload.is_pinned;
        segment.lastUsedAt = DateTime.utc();
        await segment.save();
        return { data: new CustomerSegmentTransformer(segment).toObject() };
    }

    async destroy(ctx: HttpContext) {
        const segment = await this.findOwnedOrFail(ctx);
        await segment.delete();
        return ctx.response.noContent();
    }

    private async findOwnedOrFail(ctx: HttpContext) {
        const auth = await ctx.auth.authenticate();
        const id = Number(ctx.params.id);
        if (!Number.isFinite(id)) throw new Exception("Segment not found", { status: 404, code: "E_NOT_FOUND" });
        const segment = await CustomerSegment.query().where("id", id).where("user_id", Number(auth.id)).first();
        if (!segment) throw new Exception("Segment not found", { status: 404, code: "E_NOT_FOUND" });
        return segment;
    }
}
