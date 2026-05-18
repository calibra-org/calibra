import { BaseTransformer } from "@adonisjs/core/transformers";

import type Media from "#models/media";

export default class MediaTransformer extends BaseTransformer<Media> {
    toObject() {
        const m = this.resource;
        return {
            id: Number(m.id),
            kind: m.kind,
            url: m.url,
            mime: m.mime,
            width: m.width,
            height: m.height,
            alt: m.alt,
        };
    }
}
