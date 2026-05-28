import crypto from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import { DateTime } from "luxon";

import type Customer from "#models/customer";
import CustomerDownload from "#models/customer_download";
import { accountDownloadsView } from "#table_views/account/downloads";
import CustomerDownloadTransformer from "#transformers/customer_download_transformer";

const SIGNED_URL_TTL_MINUTES = 15;

const accountDownloadsListValidator = accountDownloadsView.compileStrict({ defaultLimit: 100 });

export default class DownloadsController {
    /**
     * Lists the customer's active download grants — rows whose `expires_at` is in the future or
     * null. Phase 08 will swap the URL stub for a real signed URL backed by a CDN.
     */
    async index(ctx: HttpContext) {
        const customer = await this.requireCustomer(ctx);
        const parsed = await accountDownloadsListValidator.validate(ctx.request.qs());
        const now = DateTime.utc();
        /** Two security invariants pre-applied: customer-scope (can't read another customer's
         * grants) AND the active-grant predicate (expired rows never leak through this endpoint
         * regardless of the wire `filter[]`). */
        const builder = CustomerDownload.query()
            .where("customer_id", Number(customer.id))
            .where((q) => q.whereNull("expires_at").orWhere("expires_at", ">", now.toSQL()!));
        const { data: rows, meta } = await accountDownloadsView.run<CustomerDownload>(builder, parsed);
        return { data: rows.map((r) => new CustomerDownloadTransformer(r).toObject()), meta };
    }

    /**
     * Returns a stub signed URL — short-lived, opaque token derived from the download ID + a
     * timestamp. Phase 08 will replace the body of this method with real signing against the
     * configured CDN.
     */
    async url(ctx: HttpContext) {
        const customer = await this.requireCustomer(ctx);
        const download = await CustomerDownload.query()
            .where("id", Number(ctx.params.id))
            .where("customer_id", Number(customer.id))
            .first();

        if (!download) {
            throw new Exception("Download not found", { status: 404, code: "E_NOT_FOUND" });
        }

        const expiresAt = DateTime.utc().plus({ minutes: SIGNED_URL_TTL_MINUTES });
        const signature = crypto
            .createHash("sha256")
            .update(`${download.id}:${expiresAt.toISO()}:stub`)
            .digest("hex")
            .slice(0, 32);

        return {
            data: {
                url: `https://downloads.example.invalid/stub/${download.id}?expires=${expiresAt.toISO()}&sig=${signature}`,
                expires_at: expiresAt.toISO(),
            },
        };
    }

    private async requireCustomer(ctx: HttpContext): Promise<Customer> {
        const user = ctx.auth.getUserOrFail();
        await user.load("customer");
        const customer = user.customer;
        if (!customer) {
            throw new Exception("Customer profile missing", { status: 404, code: "E_CUSTOMER_MISSING" });
        }
        return customer;
    }
}
