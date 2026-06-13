"use client";

import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import type { TicketTab } from "#/lib/queries/tickets";

const TAB_ORDER: TicketTab[] = ["open", "pending", "snoozed", "resolved", "closed", "archived", "all"];

interface TicketStatusTabsProps {
    value: TicketTab;
    onChange: (next: TicketTab) => void;
    statusT: (key: string) => string;
    allLabel: string;
}

/**
 * Status strip across the top of the inbox. `variant="line"` underline-active style. The `all`
 * tab drops the status filter; every other tab scopes the list to a single conversation status.
 */
export function TicketStatusTabs({ value, onChange, statusT, allLabel }: TicketStatusTabsProps) {
    return (
        <Tabs value={value} onValueChange={(next) => onChange(next as TicketTab)} variant="line">
            <TabsList className="h-10 flex-wrap gap-6 px-0">
                {TAB_ORDER.map((key) => (
                    <TabsTrigger key={key} value={key} className="px-0">
                        <span>{key === "all" ? allLabel : statusT(key)}</span>
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    );
}
