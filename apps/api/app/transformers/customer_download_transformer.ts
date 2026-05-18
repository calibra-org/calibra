import { BaseTransformer } from "@adonisjs/core/transformers";

import type CustomerDownload from "#models/customer_download";

export default class CustomerDownloadTransformer extends BaseTransformer<CustomerDownload> {
    toObject() {
        return {
            id: this.resource.id,
            product_id: this.resource.productId,
            product_download_id: this.resource.productDownloadId,
            order_id: this.resource.orderId,
            granted_at: this.resource.grantedAt?.toISO() ?? null,
            expires_at: this.resource.expiresAt?.toISO() ?? null,
            download_limit: this.resource.downloadLimit,
            downloads_used: this.resource.downloadsUsed,
        };
    }
}
