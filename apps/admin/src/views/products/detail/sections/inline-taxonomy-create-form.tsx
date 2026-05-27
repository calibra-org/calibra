"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { toast } from "#/components/ui/toast";

interface InlineTaxonomyCreateFormProps {
    triggerLabel: string;
    placeholder: string;
    onSubmit: (name: string) => Promise<{ id: number }>;
    /** Optional secondary slot rendered above the Save row — used by Categories to drop a parent picker in. */
    secondary?: React.ReactNode;
    /** Toast title to show on a successful create. */
    successToast: string;
    /** Toast title to show on failure. */
    errorToast: string;
    onCreated?: (id: number) => void;
}

/**
 * The shared "+ Add new …" affordance for the taxonomy sidebar cards. Collapsed by default —
 * clicking the trigger reveals a one-field form (`name`) plus optional `secondary` slot (used
 * by Categories to mount a parent picker). Submit calls the inline-create mutation handed in,
 * fires `onCreated` with the new id so the parent card can auto-check it, and collapses again.
 *
 * No autosave: the inline-create is a discrete commit (writes to the global taxonomy table)
 * that the operator triggers explicitly. Errors surface through the standard toast strip.
 */
export function InlineTaxonomyCreateForm({
    triggerLabel,
    placeholder,
    onSubmit,
    secondary,
    successToast,
    errorToast,
    onCreated,
}: InlineTaxonomyCreateFormProps) {
    const tCommon = useTranslations("Common");
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [pending, setPending] = useState(false);

    const reset = () => {
        setOpen(false);
        setName("");
        setPending(false);
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (trimmed.length === 0 || pending) return;
        setPending(true);
        try {
            const created = await onSubmit(trimmed);
            toast.add({ title: successToast, data: { tone: "success" } });
            onCreated?.(created.id);
            reset();
        } catch (error) {
            toast.add({ title: errorToast, description: String(error), data: { tone: "error" } });
            setPending(false);
        }
    };

    if (!open) {
        return (
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-start gap-1 ps-1 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(true)}
            >
                <Plus className="size-3.5" aria-hidden="true" />
                {triggerLabel}
            </Button>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-2">
            <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={placeholder}
                /** biome-ignore lint/a11y/noAutofocus: inline form, focused on reveal */
                autoFocus
                className="h-8"
            />
            {secondary}
            <div className="flex items-center justify-end gap-1">
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1" onClick={reset} disabled={pending}>
                    <X className="size-3" aria-hidden="true" />
                    {tCommon("cancel")}
                </Button>
                <Button type="submit" size="sm" className="h-7 gap-1" disabled={pending || name.trim().length === 0}>
                    {pending ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                    ) : (
                        <Plus className="size-3" aria-hidden="true" />
                    )}
                    {tCommon("add")}
                </Button>
            </div>
        </form>
    );
}
