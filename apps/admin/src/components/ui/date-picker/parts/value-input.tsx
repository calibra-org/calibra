"use client";

import { Input } from "#/components/ui/input";
import { cn } from "#/lib/utils";

interface ValueInputProps {
    value: string;
    onChange: (next: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
    placeholder: string;
    invalid: boolean;
    errorLabel: string | null;
}

/**
 * Free-text input that mirrors the picker's current selection and accepts shorthand grammar
 * ("Q4 2025", "today", "1405-02-30", …). Submission flows through Enter; the parent owns parsing
 * via `useDateFilter`.
 */
export function ValueInput({ value, onChange, onSubmit, onCancel, placeholder, invalid, errorLabel }: ValueInputProps) {
    return (
        <div className="flex flex-col gap-1">
            <Input
                type="text"
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        onSubmit();
                    } else if (event.key === "Escape") {
                        event.preventDefault();
                        onCancel();
                    }
                }}
                aria-invalid={invalid}
                aria-describedby={invalid && errorLabel !== null ? "date-picker-input-error" : undefined}
                className={cn(invalid && "border-destructive focus-visible:ring-destructive/30")}
            />
            {invalid && errorLabel !== null && (
                <p id="date-picker-input-error" role="alert" className="text-destructive text-xs">
                    {errorLabel}
                </p>
            )}
        </div>
    );
}
