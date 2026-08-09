"use client";

import type { ReactNode } from "react";

import { PageHeader } from "#/components/PageHeader";
import { StatusBadge } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { FileText, type LucideIcon, Plus, RefreshCw } from "#/icons";
import { Link } from "#/lib/i18n/navigation";

import { FACTOR_STATUS_LABELS, FACTOR_STATUS_TONES } from "./utils";
import type { FactorStatus } from "./types";

export function FactorHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
    return <PageHeader title={title} subtitle={subtitle} actions={actions} />;
}

export function FactorStatusBadge({ status }: { status: FactorStatus }) {
    return <StatusBadge tone={FACTOR_STATUS_TONES[status]}>{FACTOR_STATUS_LABELS[status]}</StatusBadge>;
}

export function FactorCreateButton() {
    return (
        <Button asChild>
            <Link href={"/factor/documents/new" as never}>
                <Plus className="size-4" aria-hidden="true" />
                ساخت سند جدید
            </Link>
        </Button>
    );
}

export function FactorEmptyState({
    title,
    description,
    action = true,
}: {
    title: string;
    description: string;
    action?: boolean;
}) {
    return (
        <Card>
            <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
                <div className="grid size-11 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <FileText className="size-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                    <h2 className="font-medium text-sm">{title}</h2>
                    <p className="max-w-md text-muted-foreground text-sm">{description}</p>
                </div>
                {action ? <FactorCreateButton /> : null}
            </CardContent>
        </Card>
    );
}

export function FactorQueryMessage({
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
    compact = false,
}: {
    icon: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    compact?: boolean;
}) {
    return (
        <div
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-center ${compact ? "min-h-36" : "min-h-52"}`}
        >
            <div className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-5" aria-hidden="true" />
            </div>
            <p className="font-medium text-sm">{title}</p>
            <p className="max-w-md text-muted-foreground text-xs leading-5">{description}</p>
            {actionLabel && onAction ? (
                <Button type="button" variant="outline" size="sm" className="mt-1" onClick={onAction}>
                    <RefreshCw className="size-4" aria-hidden="true" />
                    {actionLabel}
                </Button>
            ) : null}
        </div>
    );
}
