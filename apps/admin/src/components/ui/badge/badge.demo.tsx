import { Badge } from "./index";

/** Showcase demo for the Badge primitive. */
export function BadgeDemo() {
    return (
        <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Variants</h3>
                <div className="flex flex-wrap gap-2">
                    <Badge>Default</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                    <Badge variant="outline">Outline</Badge>
                    <Badge variant="destructive">Destructive</Badge>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Tones × variants</h3>
                <div className="flex flex-wrap gap-2">
                    <Badge tone="info">Info</Badge>
                    <Badge tone="success">Success</Badge>
                    <Badge tone="warning">Warning</Badge>
                    <Badge tone="danger">Danger</Badge>
                    <Badge variant="secondary" tone="success">
                        Secondary success
                    </Badge>
                    <Badge variant="outline" tone="warning">
                        Outline warning
                    </Badge>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Dot variant (tone-coloured dot + label)</h3>
                <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" tone="success" dot>
                        Active
                    </Badge>
                    <Badge variant="secondary" tone="warning" dot>
                        Pending
                    </Badge>
                    <Badge variant="secondary" tone="danger" dot>
                        Cancelled
                    </Badge>
                    <Badge variant="outline" tone="info" dot>
                        Draft
                    </Badge>
                </div>
            </section>
        </div>
    );
}
