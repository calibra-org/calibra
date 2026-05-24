"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { toast } from "#/components/ui/toast";
import { formatDateTime } from "#/lib/format";
import { useMarkShipped } from "#/lib/queries/orders";
import type { AdminOrder } from "#/lib/types";

interface ShippingCardProps {
    order: AdminOrder;
    locale: Locale;
}

/**
 * Tracking + carrier capture. Save calls `POST /mark-shipped` which doubles as the processing →
 * completed transition; idempotent re-saves just update the metadata. `notify_customer` controls
 * whether the (stubbed) shipping email goes out. Renders as a section body.
 */
export function ShippingCard({ order, locale }: ShippingCardProps) {
    const t = useTranslations("Orders.detail.shippingCard");
    const info = order.shippingInfo;
    const [tracking, setTracking] = useState(info?.trackingNumber ?? "");
    const [carrier, setCarrier] = useState(info?.carrier ?? "");
    const [notify, setNotify] = useState(true);
    const mutation = useMarkShipped();

    useEffect(() => {
        setTracking(info?.trackingNumber ?? "");
        setCarrier(info?.carrier ?? "");
    }, [info?.trackingNumber, info?.carrier]);

    const save = async () => {
        try {
            await mutation.mutateAsync({
                id: order.id,
                tracking_number: tracking || null,
                carrier: carrier || null,
                notify_customer: notify,
            });
            toast.add({ title: t("saved"), timeout: 2500, data: { tone: "success" } });
        } catch {
            toast.add({ title: t("saveFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

    const copy = () => {
        if (!tracking) return;
        void navigator.clipboard?.writeText(tracking);
        toast.add({ title: t("trackingCopied"), timeout: 2000, data: { tone: "success" } });
    };

    return (
        <div className="flex flex-col gap-3">
            {info?.shippedAt && <p className="text-muted-foreground text-xs">{formatDateTime(info.shippedAt, locale)}</p>}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="shipping-tracking">{t("tracking")}</Label>
                    <div className="flex gap-2">
                        <Input
                            id="shipping-tracking"
                            value={tracking}
                            onChange={(event) => setTracking(event.target.value)}
                            placeholder={t("trackingPlaceholder")}
                        />
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={copy}
                            disabled={!tracking}
                            aria-label={t("trackingCopied")}
                        >
                            <Copy className="size-4" aria-hidden="true" />
                        </Button>
                    </div>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="shipping-carrier">{t("carrier")}</Label>
                    <Input
                        id="shipping-carrier"
                        value={carrier}
                        onChange={(event) => setCarrier(event.target.value)}
                        placeholder={t("carrierPlaceholder")}
                    />
                </div>
            </div>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                    <Switch checked={notify} onCheckedChange={(value) => setNotify(value === true)} aria-label={t("save")} />
                    <span>{t("save")}</span>
                </div>
                <Button onClick={save} disabled={mutation.isPending}>
                    {t("save")}
                </Button>
            </div>
        </div>
    );
}
