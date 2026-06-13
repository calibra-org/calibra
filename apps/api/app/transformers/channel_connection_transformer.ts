import { BaseTransformer } from "@adonisjs/core/transformers";

import type ChannelConnection from "#models/channel_connection";
import { mask } from "#services/channels/channel_credential_store";

/**
 * Channel-connection shape for the admin connect surface. Delegates to the credential store's
 * {@link mask} so the secret-free public view is single-sourced: `public_config` + status only, NEVER
 * the sealed `channel_secrets` ciphertext or any plaintext credential (DoD security).
 */
export default class ChannelConnectionTransformer extends BaseTransformer<ChannelConnection> {
    toObject() {
        return mask({
            id: this.resource.id,
            provider: this.resource.provider,
            providerVariant: this.resource.providerVariant,
            endpointId: String(this.resource.endpointId),
            status: this.resource.status,
            publicConfig: this.resource.publicConfig ?? {},
            keyVersion: this.resource.keyVersion,
            lastVerifiedAt: this.resource.lastVerifiedAt?.toISO() ?? null,
            lastError: this.resource.lastError,
        });
    }
}
