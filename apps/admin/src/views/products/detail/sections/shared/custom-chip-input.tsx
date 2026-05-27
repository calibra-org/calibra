"use client";

import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useState } from "react";

import { X } from "#/icons";

interface CustomChipInputProps {
    values: string[];
    onChange: (next: string[]) => void;
    placeholder: string;
    label: string;
    help: ReactNode;
    removeAria: string;
}

/**
 * Chip-style input for free-form value lists (the Specs card's free-form rows). Enter commits
 * the current draft as a chip; Backspace on an empty input deletes the previous chip. Duplicate
 * values are ignored so the operator can't accidentally split a chip strip with two identical
 * entries.
 */
export function CustomChipInput({ values, onChange, placeholder, label, help, removeAria }: CustomChipInputProps) {
    const [draft, setDraft] = useState("");

    const commit = (text: string) => {
        const trimmed = text.trim();
        if (trimmed.length === 0) return;
        if (values.includes(trimmed)) return;
        onChange([...values, trimmed]);
    };

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            commit(draft);
            setDraft("");
            return;
        }
        if (event.key === "Backspace" && draft.length === 0 && values.length > 0) {
            event.preventDefault();
            onChange(values.slice(0, -1));
        }
    };

    return (
        <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">{label}</span>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background p-1.5">
                {values.map((value, valueIndex) => (
                    <span
                        key={value}
                        className="inline-flex items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-2 py-0.5 text-foreground text-xs"
                    >
                        {value}
                        <button
                            type="button"
                            aria-label={removeAria}
                            onClick={() => onChange(values.filter((_, i) => i !== valueIndex))}
                            className="grid size-4 place-items-center rounded hover:bg-background/60 hover:text-destructive"
                        >
                            <X className="size-3" aria-hidden="true" />
                        </button>
                    </span>
                ))}
                <input
                    type="text"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="h-6 min-w-32 flex-1 bg-transparent text-xs outline-none"
                />
            </div>
            <span className="text-muted-foreground text-xs leading-relaxed">{help}</span>
        </div>
    );
}
