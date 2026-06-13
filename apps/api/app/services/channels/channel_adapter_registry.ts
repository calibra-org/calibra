import type { ChannelAdapter } from "#services/channels/channel_adapter";
import { internalAdapter } from "#services/channels/internal_adapter";
import { telegramAdapter } from "#services/channels/telegram_adapter";
import { whatsappAdapter } from "#services/channels/whatsapp_adapter";

/**
 * Singleton registry of every communication-channel adapter, mirroring
 * `payment_adapter_registry.ts`. The map is built at module load — adapters are stateless, so no DI
 * is needed. Adding a channel is a one-line `register()` call in the footer.
 *
 * In v1 all three adapters are REGISTERED but only `internal` is live: inbox creation for
 * `whatsapp` / `telegram` is gated off upstream (R6) because there is no reachable relay yet. The
 * adapters still translate, verify, and unit-test against a fake provider so the seam is real.
 */
export class ChannelAdapterRegistry {
    private readonly adapters = new Map<string, ChannelAdapter>();

    register(adapter: ChannelAdapter): void {
        this.adapters.set(adapter.provider, adapter);
    }

    has(provider: string): boolean {
        return this.adapters.has(provider);
    }

    get(provider: string): ChannelAdapter {
        const adapter = this.adapters.get(provider);
        if (!adapter) {
            throw new Error(`No channel adapter registered for provider "${provider}"`);
        }
        return adapter;
    }
}

export const channelAdapterRegistry = new ChannelAdapterRegistry();

channelAdapterRegistry.register(internalAdapter);
channelAdapterRegistry.register(whatsappAdapter);
channelAdapterRegistry.register(telegramAdapter);
