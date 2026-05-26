"use client";

import { CheckCircle2, Copy, ExternalLink, FilePen, Hash, MessageSquareReply, Trash2, Undo2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { DataTableRowActions } from "#/components/ui/data-grid";
import { DropdownMenuItem, DropdownMenuSeparator } from "#/components/ui/dropdown-menu";
import type { AdminReview } from "#/lib/types";

export interface RowActionHandlers {
    onApprove?: (review: AdminReview) => void;
    onUnapprove?: (review: AdminReview) => void;
    onMarkSpam?: (review: AdminReview) => void;
    onUnspam?: (review: AdminReview) => void;
    onReply?: (review: AdminReview) => void;
    onQuickEdit?: (review: AdminReview) => void;
    onTrash?: (review: AdminReview) => void;
    onRestore?: (review: AdminReview) => void;
    onDelete?: (review: AdminReview) => void;
    onCopyEmail?: (email: string) => void;
    onCopyId?: (id: number) => void;
    onOpenProduct?: (review: AdminReview) => void;
}

interface RowActionsProps extends RowActionHandlers {
    review: AdminReview;
}

/**
 * Per-row ⋯ menu. Mirrors the WordPress hover-row toolbar: Approve/Unapprove, Reply, Quick Edit,
 * Spam, Trash. Restore + permanent delete take over inside the Trash tab.
 */
export function RowActions({
    review,
    onApprove,
    onUnapprove,
    onMarkSpam,
    onUnspam,
    onReply,
    onQuickEdit,
    onTrash,
    onRestore,
    onDelete,
    onCopyEmail,
    onCopyId,
    onOpenProduct,
}: RowActionsProps) {
    const t = useTranslations("Reviews.list");
    const isTrashed = review.status === "trash";
    const isSpam = review.status === "spam";
    const isApproved = review.status === "approved";

    const copyEmail = () => {
        void navigator.clipboard?.writeText(review.reviewerEmail);
        onCopyEmail?.(review.reviewerEmail);
    };
    const copyId = () => {
        void navigator.clipboard?.writeText(String(review.id));
        onCopyId?.(review.id);
    };

    return (
        <DataTableRowActions label={t("rowActionsLabel")}>
            {!isTrashed && !isApproved && onApprove !== undefined && (
                <DropdownMenuItem onClick={() => onApprove(review)}>
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    {t("actions.approve")}
                </DropdownMenuItem>
            )}
            {!isTrashed && isApproved && onUnapprove !== undefined && (
                <DropdownMenuItem onClick={() => onUnapprove(review)}>
                    <XCircle className="size-3.5" aria-hidden="true" />
                    {t("actions.unapprove")}
                </DropdownMenuItem>
            )}
            {!isTrashed && onReply !== undefined && (
                <DropdownMenuItem onClick={() => onReply(review)}>
                    <MessageSquareReply className="size-3.5" aria-hidden="true" />
                    {t("actions.reply")}
                </DropdownMenuItem>
            )}
            {!isTrashed && onQuickEdit !== undefined && (
                <DropdownMenuItem onClick={() => onQuickEdit(review)}>
                    <FilePen className="size-3.5" aria-hidden="true" />
                    {t("actions.quickEdit")}
                </DropdownMenuItem>
            )}
            {!isTrashed && !isSpam && onMarkSpam !== undefined && (
                <DropdownMenuItem onClick={() => onMarkSpam(review)}>
                    <XCircle className="size-3.5" aria-hidden="true" />
                    {t("actions.spam")}
                </DropdownMenuItem>
            )}
            {!isTrashed && isSpam && onUnspam !== undefined && (
                <DropdownMenuItem onClick={() => onUnspam(review)}>
                    <Undo2 className="size-3.5" aria-hidden="true" />
                    {t("actions.unspam")}
                </DropdownMenuItem>
            )}
            {isTrashed && onRestore !== undefined && (
                <DropdownMenuItem onClick={() => onRestore(review)}>
                    <Undo2 className="size-3.5" aria-hidden="true" />
                    {t("actions.restore")}
                </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {onOpenProduct !== undefined && (
                <DropdownMenuItem onClick={() => onOpenProduct(review)}>
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    {t("actions.openProduct")}
                </DropdownMenuItem>
            )}
            {review.reviewerEmail.length > 0 && (
                <DropdownMenuItem onClick={copyEmail}>
                    <Copy className="size-3.5" aria-hidden="true" />
                    {t("actions.copyEmail")}
                </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={copyId}>
                <Hash className="size-3.5" aria-hidden="true" />
                {t("actions.copyId")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {!isTrashed && onTrash !== undefined && (
                <DropdownMenuItem onClick={() => onTrash(review)} className="text-danger hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    {t("actions.trash")}
                </DropdownMenuItem>
            )}
            {isTrashed && onDelete !== undefined && (
                <DropdownMenuItem onClick={() => onDelete(review)} className="text-danger hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    {t("actions.delete")}
                </DropdownMenuItem>
            )}
        </DataTableRowActions>
    );
}
