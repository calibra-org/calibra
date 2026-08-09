"use client";

import { useEffect } from "react";

export function ContentViewTracker({ postId }: { postId: number }) {
    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            void fetch("/api/content/events", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ post_id: postId, event_type: "view" }),
                signal: controller.signal,
                keepalive: true,
            }).catch(() => undefined);
        }, 1200);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [postId]);
    return null;
}
