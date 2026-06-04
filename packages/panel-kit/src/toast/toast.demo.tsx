"use client";

import { Button } from "../button";

import { Toaster, toast, toastPromise } from "./index";

/** Showcase demo for the Toast primitive. Mounts its own Toaster so the demo is self-contained. */
export function ToastDemo() {
    return (
        <div className="flex flex-col gap-4">
            <section className="flex flex-wrap gap-2">
                <Button onClick={() => toast.add({ title: "Default toast", description: "Default tone (info icon)." })}>
                    Default
                </Button>
                <Button
                    onClick={() => toast.add({ title: "Success", description: "Mutation landed.", data: { tone: "success" } })}
                    tone="success"
                >
                    Success
                </Button>
                <Button
                    onClick={() =>
                        toast.add({ title: "Warning", description: "Stock low on 3 SKUs.", data: { tone: "warning" } })
                    }
                    tone="warning"
                >
                    Warning
                </Button>
                <Button
                    onClick={() =>
                        toast.add({ title: "Error", description: "Save failed — try again.", data: { tone: "error" } })
                    }
                    tone="danger"
                >
                    Error
                </Button>
                <Button
                    variant="outline"
                    onClick={() => {
                        toastPromise(new Promise<void>((resolve) => setTimeout(resolve, 1200)), {
                            loading: "Saving…",
                            success: () => "Saved.",
                            error: () => "Failed.",
                        });
                    }}
                >
                    toastPromise (success after 1.2s)
                </Button>
                <Button
                    variant="outline"
                    onClick={() => {
                        toastPromise(
                            new Promise<void>((_, reject) => setTimeout(() => reject(new Error("nope")), 1200)).catch(() => {}),
                            {
                                loading: "Saving…",
                                success: () => "Saved.",
                                error: () => "Failed — try again.",
                            },
                        );
                    }}
                >
                    toastPromise (failure after 1.2s)
                </Button>
            </section>
            <Toaster />
        </div>
    );
}
