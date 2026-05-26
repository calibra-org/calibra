"use client";

import { useState } from "react";

import { Plus, Trash2 } from "#/icons";

import { Button, IconButton, ToggleButton } from "./index";

/** Showcase demo for the Button primitive. Wired into `/dev/ds/button`. */
export function ButtonDemo() {
    const [loading, setLoading] = useState(false);
    return (
        <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Variants</h3>
                <div className="flex flex-wrap gap-2">
                    <Button>Default</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="link">Link</Button>
                    <Button variant="destructive">Destructive</Button>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Tones (compounded with variant)</h3>
                <div className="flex flex-wrap gap-2">
                    <Button tone="success">Success</Button>
                    <Button tone="warning">Warning</Button>
                    <Button tone="danger">Danger</Button>
                    <Button variant="outline" tone="success">
                        Outline success
                    </Button>
                    <Button variant="outline" tone="danger">
                        Outline danger
                    </Button>
                    <Button variant="ghost" tone="warning">
                        Ghost warning
                    </Button>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Sizes</h3>
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="xs">Xs</Button>
                    <Button size="sm">Sm</Button>
                    <Button size="md">Md (default)</Button>
                    <Button size="lg">Lg</Button>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Loading state (width preserved)</h3>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        isLoading={loading}
                        onClick={() => {
                            setLoading(true);
                            setTimeout(() => setLoading(false), 1500);
                        }}
                    >
                        Click to load
                    </Button>
                    <Button variant="outline" isLoading>
                        Always loading
                    </Button>
                    <Button tone="danger" isLoading>
                        Saving…
                    </Button>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">IconButton</h3>
                <div className="flex flex-wrap items-center gap-2">
                    <IconButton aria-label="Add">
                        <Plus />
                    </IconButton>
                    <IconButton aria-label="Delete" variant="outline" tone="danger">
                        <Trash2 />
                    </IconButton>
                    <IconButton aria-label="Add" size="sm">
                        <Plus />
                    </IconButton>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">ToggleButton</h3>
                <div className="flex flex-wrap gap-2">
                    <ToggleButton defaultPressed>Pinned</ToggleButton>
                    <ToggleButton>Unpinned</ToggleButton>
                </div>
            </section>
        </div>
    );
}
