"use client";

import { CheckCircle2, MessageSquareReply, Star, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import { useModerateReview, useSaveReviewReply } from "#/lib/reviews/mutations";
import type { AdminReview, ReviewStatus } from "#/lib/types";
import { cn } from "#/lib/utils";

interface ReplyPanelProps {
    review: AdminReview;
    onClose: () => void;
    /** When `reply`, the textarea autofocuses on mount. When `edit`, the rating row is focused. */
    intent?: "reply" | "edit";
}

const EDITABLE_STATUSES: ReviewStatus[] = ["pending", "approved", "spam"];

/**
 * WordPress merges Reply and Quick Edit into the same inline form — so do we. The panel exposes a
 * star rating control, the review body, a status select, and the admin reply textarea. Status
 * `trash` is omitted from the picker since the trash flow is driven by the row's trash button.
 *
 * Saving fans out into two mutations: `PATCH /admin/reviews/{id}` for the rating + body + status
 * triple, and the client-side reply store for the admin reply. Both fire in parallel and the
 * panel closes only when neither errored.
 */
export function ReplyPanel({ review, onClose, intent = "reply" }: ReplyPanelProps) {
    const t = useTranslations("Reviews.list");
    const statusT = useTranslations("ReviewStatus");

    const [rating, setRating] = useState(review.rating);
    const [body, setBody] = useState(review.body);
    const [reply, setReply] = useState(review.reply ?? "");
    const [status, setStatus] = useState<ReviewStatus>(review.status === "trash" ? "pending" : review.status);

    const moderate = useModerateReview();
    const saveReply = useSaveReviewReply();

    useEffect(() => {
        const node = document.getElementById(intent === "reply" ? "review-reply-textarea" : "review-body-textarea");
        node?.focus();
    }, [intent]);

    const onSave = async () => {
        try {
            const sdkStatus = status === "spam" ? "rejected" : status === "approved" ? "approved" : "pending";
            await Promise.all([
                moderate.mutateAsync({ id: review.id, status: sdkStatus, rating, body }),
                saveReply.mutateAsync({ id: review.id, body: reply }),
            ]);
            toast.add({ title: t("saved"), timeout: 2500, data: { tone: "success" } });
            onClose();
        } catch {
            toast.add({ title: t("saveFailed"), timeout: 4000, data: { tone: "error" } });
        }
    };

    const isPending = moderate.isPending || saveReply.isPending;

    return (
        <div className="flex flex-col gap-4 border-primary/20 border-y bg-muted/30 p-5">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <MessageSquareReply className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="font-medium text-sm">{t("quickEdit.title")}</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
                        {t("cancel")}
                    </Button>
                    <Button size="sm" onClick={onSave} disabled={isPending}>
                        {isPending ? t("saving") : t("save")}
                    </Button>
                </div>
            </header>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="review-rating" className="text-xs">
                            {t("quickEdit.rating")}
                        </Label>
                        <RatingPicker value={rating} onChange={setRating} label={t("quickEdit.rating")} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="review-status" className="text-xs">
                            {t("quickEdit.status")}
                        </Label>
                        <Select value={status} onValueChange={(value) => setStatus(value as ReviewStatus)}>
                            <SelectTrigger id="review-status">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {EDITABLE_STATUSES.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        <span className="flex items-center gap-2">
                                            {value === "approved" && <CheckCircle2 className="size-3.5 text-emerald-500" />}
                                            {value === "pending" && <Star className="size-3.5 text-amber-500" />}
                                            {value === "spam" && <XCircle className="size-3.5 text-rose-500" />}
                                            {statusT(value)}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="review-body-textarea" className="text-xs">
                            {t("quickEdit.body")}
                        </Label>
                        <Textarea
                            id="review-body-textarea"
                            value={body}
                            onChange={(event) => setBody(event.target.value)}
                            rows={4}
                            className="min-h-24"
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="review-reply-textarea" className="flex items-center justify-between text-xs">
                        <span>{t("quickEdit.reply")}</span>
                        {review.repliedAt !== null && (
                            <span className="text-muted-foreground">{t("quickEdit.repliedAlready")}</span>
                        )}
                    </Label>
                    <Textarea
                        id="review-reply-textarea"
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        placeholder={t("quickEdit.replyPlaceholder")}
                        rows={9}
                        className="min-h-44"
                    />
                    <p className="text-muted-foreground text-xs">{t("quickEdit.replyHint")}</p>
                </div>
            </div>
        </div>
    );
}

interface RatingPickerProps {
    value: number;
    onChange: (value: 1 | 2 | 3 | 4 | 5) => void;
    label: string;
}

/** Five-button star picker built on native radio inputs so the keyboard story is browser-default. */
function RatingPicker({ value, onChange, label }: RatingPickerProps) {
    return (
        <fieldset className="inline-flex items-center gap-1 border-0 p-0">
            <legend className="sr-only">{label}</legend>
            {[1, 2, 3, 4, 5].map((index) => (
                <label
                    key={index}
                    className={cn(
                        "grid size-7 cursor-pointer place-items-center rounded-md text-amber-500 transition-colors hover:bg-amber-500/10",
                        index === value && "bg-amber-500/15",
                    )}
                >
                    <input
                        type="radio"
                        name="review-rating"
                        value={index}
                        checked={index === value}
                        onChange={() => onChange(index as 1 | 2 | 3 | 4 | 5)}
                        className="sr-only"
                    />
                    <Star
                        className={cn("size-4", index <= value ? "fill-current" : "stroke-current opacity-25")}
                        aria-hidden="true"
                    />
                </label>
            ))}
        </fieldset>
    );
}
