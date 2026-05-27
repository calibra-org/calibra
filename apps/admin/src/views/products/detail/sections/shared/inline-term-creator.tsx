"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useState } from "react";

interface InlineTermCreatorProps {
    placeholder: string;
    onCreate: (name: string) => Promise<void>;
    busy: boolean;
}

/**
 * Compact text input that turns Enter into a `POST /admin/attributes/:id/terms` (or whatever
 * `onCreate` does). Sits at the end of a chip strip; the parent decides what to do with the
 * newly-created id (e.g. append to `term_ids` so the chip lands already-selected).
 */
export function InlineTermCreator({ placeholder, onCreate, busy }: InlineTermCreatorProps) {
    const [value, setValue] = useState("");
    const handleKeyDown = async (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key !== "Enter") return;
        const trimmed = value.trim();
        if (trimmed.length === 0 || busy) return;
        event.preventDefault();
        await onCreate(trimmed);
        setValue("");
    };
    return (
        <input
            type="text"
            value={value}
            disabled={busy}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => void handleKeyDown(event)}
            placeholder={placeholder}
            className="h-7 rounded border border-border border-dashed bg-transparent px-2 text-xs outline-none focus:border-ring"
        />
    );
}
