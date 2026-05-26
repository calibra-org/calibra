"use client";

import { useState } from "react";

import { Button } from "#/components/ui/button";

import { Dialog } from "./index";

/** Showcase demo for the Dialog primitive. */
export function DialogDemo() {
    const [basicOpen, setBasicOpen] = useState(false);
    const [loadingOpen, setLoadingOpen] = useState(false);
    return (
        <div className="flex flex-col gap-4">
            <section className="flex flex-wrap gap-2">
                <Button onClick={() => setBasicOpen(true)}>Open basic dialog</Button>
                <Button onClick={() => setLoadingOpen(true)} variant="outline">
                    Open with isLoading
                </Button>
            </section>

            <Dialog
                open={basicOpen}
                onOpenChange={setBasicOpen}
                title="Edit product"
                description="Update the SKU and price."
                footer={
                    <>
                        <Button variant="outline" onClick={() => setBasicOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={() => setBasicOpen(false)}>Save</Button>
                    </>
                }
            >
                <p>Form body would render here.</p>
            </Dialog>

            <Dialog
                open={loadingOpen}
                onOpenChange={setLoadingOpen}
                title="Loading example"
                description="Body becomes a Skeleton while loading; header + footer keep rendering."
                isLoading
                footer={<Button onClick={() => setLoadingOpen(false)}>Close</Button>}
            >
                Real content would go here once loaded.
            </Dialog>
        </div>
    );
}
