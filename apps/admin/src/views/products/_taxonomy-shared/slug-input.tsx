"use client";

import type { ChangeEvent } from "react";

import { Input } from "#/components/ui/input";
import { Hash } from "#/icons";

interface SlugInputProps {
    id: string;
    value: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
}

/**
 * Slug field shared by every taxonomy inspector. The whole control is forced LTR (slugs are
 * URL identifiers) so the `#` prefix icon, the input text, and the start-padding all line up on
 * the same edge. Previously the input was `dir="ltr"` while its wrapper followed the RTL page, so
 * the icon (logical start = right under RTL) and the input's start-padding (LTR start = left)
 * landed on opposite sides and the field read broken.
 */
export function SlugInput({ id, value, onChange, placeholder }: SlugInputProps) {
    return (
        <div dir="ltr" className="relative">
            <Hash
                className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
            />
            <Input
                id={id}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                autoComplete="off"
                className="ps-9 font-mono"
            />
        </div>
    );
}
