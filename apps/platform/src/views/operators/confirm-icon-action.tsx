"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import {
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogRoot,
    AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";

/**
 * A ghost icon button for an operator row action: a hover/focus tooltip names what it does, and a
 * click opens a confirm dialog before the (consequential) action runs. Keeps the dense icon row
 * legible while guarding disable / remove / reset / make-owner behind an explicit confirmation.
 */
export function ConfirmIconAction({
    icon,
    label,
    title,
    description,
    confirmLabel,
    cancelLabel,
    destructive = false,
    disabled = false,
    onConfirm,
}: {
    icon: ReactNode;
    /** Tooltip + accessible name. */
    label: string;
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
    destructive?: boolean;
    disabled?: boolean;
    onConfirm: () => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Tooltip>
                <TooltipTrigger
                    render={
                        <Button variant="ghost" size="icon" aria-label={label} disabled={disabled} onClick={() => setOpen(true)}>
                            {icon}
                        </Button>
                    }
                />
                <TooltipContent>{label}</TooltipContent>
            </Tooltip>
            <AlertDialogRoot open={open} onOpenChange={setOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{title}</AlertDialogTitle>
                        <AlertDialogDescription>{description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            {cancelLabel}
                        </Button>
                        <Button
                            variant={destructive ? "destructive" : "default"}
                            onClick={() => {
                                setOpen(false);
                                onConfirm();
                            }}
                        >
                            {confirmLabel}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialogRoot>
        </>
    );
}
