"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { Button } from "#/components/ui/button";
import { DataTableBulkBar } from "#/components/ui/data-grid/data-table-bulk-bar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { CheckCircle2, UserPlus } from "#/icons";
import { apiMutate } from "#/lib/queries/api-client";
import type { TicketAgent, UpdateTicketInput } from "#/lib/queries/tickets";

interface BulkActionsProps {
    selectedIds: ReadonlySet<string>;
    onClear: () => void;
    agents: TicketAgent[];
    t: (key: string, values?: Record<string, string | number>) => string;
    statusT: (key: string) => string;
}

const BULK_STATUSES = ["open", "pending", "resolved", "closed"] as const;

/**
 * Inbox bulk bar — assign every selected conversation to an agent or flip them to a status. The
 * ticketing API has no batch endpoint yet, so the mutation fans the same PATCH across each selected
 * id (`Promise.all`) and invalidates the list cache once on completion. The single id-less
 * mutation hook lives at the top of the component, satisfying rules-of-hooks.
 */
export function TicketBulkActions({ selectedIds, onClear, agents, t, statusT }: BulkActionsProps) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    const bulk = useMutation({
        mutationFn: async ({ ids, patch }: { ids: string[]; patch: UpdateTicketInput }) => {
            await Promise.all(ids.map((id) => apiMutate("PATCH", `tickets/${id}`, { locale, body: patch })));
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "tickets", "list"] }),
    });

    if (selectedIds.size === 0) return null;
    const ids = Array.from(selectedIds);

    const apply = async (patch: UpdateTicketInput) => {
        await bulk.mutateAsync({ ids, patch });
        onClear();
    };

    return (
        <DataTableBulkBar
            selectedCount={selectedIds.size}
            onClear={onClear}
            label={(count) => t("bulk.selectedCount", { count })}
            clearLabel={t("bulk.clear")}
        >
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={(props) => (
                        <Button {...props} type="button" variant="ghost" size="sm" className="text-primary-foreground">
                            <UserPlus className="me-2 size-3.5" aria-hidden="true" />
                            {t("bulk.assign")}
                        </Button>
                    )}
                />
                <DropdownMenuContent align="end">
                    {agents.length === 0 ? (
                        <DropdownMenuItem disabled>{t("bulk.noAgents")}</DropdownMenuItem>
                    ) : (
                        agents.map((agent) => (
                            <DropdownMenuItem
                                key={agent.id}
                                onClick={() => apply({ assignee_agent_id: agent.id })}
                                disabled={bulk.isPending}
                            >
                                {agent.user?.email ?? agent.id}
                            </DropdownMenuItem>
                        ))
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={(props) => (
                        <Button {...props} type="button" variant="ghost" size="sm" className="text-primary-foreground">
                            <CheckCircle2 className="me-2 size-3.5" aria-hidden="true" />
                            {t("bulk.setStatus")}
                        </Button>
                    )}
                />
                <DropdownMenuContent align="end">
                    {BULK_STATUSES.map((status) => (
                        <DropdownMenuItem key={status} onClick={() => apply({ status })} disabled={bulk.isPending}>
                            {statusT(status)}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </DataTableBulkBar>
    );
}
