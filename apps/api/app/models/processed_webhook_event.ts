import { ProcessedWebhookEventSchema } from "#database/schema";

export default class ProcessedWebhookEvent extends ProcessedWebhookEventSchema {
    static table = "processed_webhook_events";
}
