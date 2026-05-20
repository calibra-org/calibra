"use client";

import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";

interface DataTableRowActionsProps {
    children: ReactNode;
    label: string;
    align?: "start" | "end" | "center";
}

/** Sticky-end ⋯ menu trigger used as the row-actions cell. Children are {@link DropdownMenuItem}s. */
export function DataTableRowActions({ children, label, align = "end" }: DataTableRowActionsProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={(props) => (
                    <Button
                        {...props}
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        aria-label={label}
                    >
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                    </Button>
                )}
            />
            <DropdownMenuContent align={align} className="min-w-44">
                {children}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
