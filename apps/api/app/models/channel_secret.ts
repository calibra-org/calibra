import { ChannelSecretSchema } from "#database/schema";

/** AEAD-sealed credential ciphertext for a channel connection (never returned to a client). */
export default class ChannelSecret extends ChannelSecretSchema {
    static table = "channel_secrets";
}
