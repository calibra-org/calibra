"use client";

import { type ReactNode, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";

export interface IncludeExcludeValue {
    include: number[];
    exclude: number[];
}

interface IncludeExcludePickerProps {
    value: IncludeExcludeValue;
    onChange: (next: IncludeExcludeValue) => void;
    /** Render the picker control for one tab; receives current ids + setter. */
    renderPicker: (ids: number[], setIds: (next: number[]) => void, mode: "include" | "exclude") => ReactNode;
    labels: {
        includeTab: string;
        excludeTab: string;
        /** Hint shown above the picker when nothing is selected on either side. */
        hint?: string;
    };
}

/**
 * Two-tab include/exclude picker. Each tab owns one half of the constraint set; switching tabs
 * preserves the other half. Used for product / category / brand constraints in the coupon
 * editor.
 */
export function IncludeExcludePicker({ value, onChange, renderPicker, labels }: IncludeExcludePickerProps) {
    const [tab, setTab] = useState<"include" | "exclude">("include");
    return (
        <div className="flex flex-col gap-3">
            {labels.hint && <p className="text-muted-foreground text-sm">{labels.hint}</p>}
            <Tabs value={tab} onValueChange={(next) => setTab(next as "include" | "exclude")} variant="line">
                <TabsList className="h-9">
                    <TabsTrigger value="include">
                        {labels.includeTab}
                        {value.include.length > 0 && (
                            <span className="ms-1 text-muted-foreground tabular-nums">({value.include.length})</span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="exclude">
                        {labels.excludeTab}
                        {value.exclude.length > 0 && (
                            <span className="ms-1 text-muted-foreground tabular-nums">({value.exclude.length})</span>
                        )}
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="include" className="mt-3">
                    {renderPicker(value.include, (next) => onChange({ ...value, include: next }), "include")}
                </TabsContent>
                <TabsContent value="exclude" className="mt-3">
                    {renderPicker(value.exclude, (next) => onChange({ ...value, exclude: next }), "exclude")}
                </TabsContent>
            </Tabs>
        </div>
    );
}
