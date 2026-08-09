"use client";

import type { MouseEvent, ReactNode } from "react";

import { Link } from "#/lib/i18n/navigation";

export function ProductContentLink({
    postId,
    productId,
    productSlug,
    children,
}: {
    postId: number;
    productId: number;
    productSlug?: string | null;
    children: ReactNode;
}) {
    function track(_event: MouseEvent<HTMLAnchorElement>) {
        void fetch("/api/content/events", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ post_id: postId, product_id: productId, event_type: "product_click" }),
            keepalive: true,
        }).catch(() => undefined);
    }
    return (
        <Link href={productSlug ? `/products/${productSlug}` : "/products"} onClick={track}>
            {children}
        </Link>
    );
}
