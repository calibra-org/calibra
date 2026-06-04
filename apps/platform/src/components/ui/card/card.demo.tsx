"use client";

import { useState } from "react";

import { Button } from "#/components/ui/button";

import { Card, CardBody, CardFooter, CardHeader, CardRoot, CardTitle } from "./index";

/** Showcase demo for the Card primitive. */
export function CardDemo() {
    const [loading, setLoading] = useState(false);
    return (
        <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Convenience wrapper</h3>
                <Card title="Orders today" description="Across all warehouses">
                    <p>1,284 orders, total ₣42.5M</p>
                </Card>
            </section>

            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Tones (border + title)</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Card tone="success" title="Healthy">
                        All systems nominal.
                    </Card>
                    <Card tone="warning" title="Attention">
                        Stock low on 3 SKUs.
                    </Card>
                    <Card tone="danger" title="Critical">
                        Payment gateway is offline.
                    </Card>
                    <Card tone="info" title="Info">
                        New release available.
                    </Card>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">isLoading (Skeleton body)</h3>
                <Button variant="outline" size="sm" onClick={() => setLoading((v) => !v)} className="w-fit">
                    Toggle loading: {String(loading)}
                </Button>
                <Card title="Refunds queue" isLoading={loading} footer={<Button size="sm">View all</Button>}>
                    <p>14 pending, 7 awaiting approval.</p>
                </Card>
            </section>

            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Compound subparts</h3>
                <CardRoot>
                    <CardHeader>
                        <CardTitle>Custom header layout</CardTitle>
                    </CardHeader>
                    <CardBody>Body content placed via compound subparts.</CardBody>
                    <CardFooter>Right-aligned footer.</CardFooter>
                </CardRoot>
            </section>
        </div>
    );
}
