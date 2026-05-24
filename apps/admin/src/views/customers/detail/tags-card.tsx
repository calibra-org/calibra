"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { useAttachCustomerTag, useCustomerTagSuggestions, useDetachCustomerTag } from "#/lib/queries/customers";
import type { AdminCustomer } from "#/lib/types";

interface TagsCardProps {
    customer: AdminCustomer;
    t: (key: string) => string;
}

export function TagsCard({ customer, t }: TagsCardProps) {
    const [input, setInput] = useState("");
    const attach = useAttachCustomerTag(customer.id);
    const detach = useDetachCustomerTag(customer.id);
    const { data: suggestions = [] } = useCustomerTagSuggestions(input);

    const submit = async () => {
        if (input.trim().length === 0) return;
        await attach.mutateAsync(input.trim());
        setInput("");
    };

    return (
        <div className="flex flex-col gap-3 text-sm">
            {customer.tags.length === 0 ? (
                <span className="text-muted-foreground">{t("noTags")}</span>
            ) : (
                <div className="flex flex-wrap gap-1.5">
                    {customer.tags.map((tag) => {
                        const tagRow = suggestions.find((s) => s.name === tag);
                        return (
                            <Badge key={tag} variant="secondary" className="gap-1 ps-2.5 pe-1.5 text-xs">
                                {tag}
                                {tagRow !== undefined && (
                                    <button
                                        type="button"
                                        className="rounded-full p-0.5 hover:bg-muted-foreground/15"
                                        onClick={() => detach.mutate(tagRow.id)}
                                        aria-label={`Remove ${tag}`}
                                    >
                                        <X className="size-3" aria-hidden="true" />
                                    </button>
                                )}
                            </Badge>
                        );
                    })}
                </div>
            )}
            <div className="flex gap-2">
                <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    placeholder={t("addTag")}
                />
                <Button onClick={submit} disabled={attach.isPending || input.trim().length === 0}>
                    {t("addTag")}
                </Button>
            </div>
            {suggestions.length > 0 && input.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {suggestions.slice(0, 8).map((s) => (
                        <button
                            type="button"
                            key={s.id}
                            className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground"
                            onClick={() => {
                                setInput(s.name);
                                attach.mutate(s.name);
                                setInput("");
                            }}
                        >
                            {s.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
