"use client";

import type { Locale } from "@calibra/shared/i18n";

import { Switch } from "#/components/ui/switch";
import { formatRelativeTime } from "#/lib/format";
import { useCustomerMarketingHistory, useCustomerMarketingPrefs, useUpdateCustomerMarketingPref } from "#/lib/queries/customers";
import { useSettleMutation } from "#/lib/queries/use-settle-mutation";

interface MarketingPrefsCardProps {
    customerId: number;
    locale: Locale;
    t: (key: string) => string;
}

type Channel = "email" | "sms" | "phone";

/**
 * Wires one Switch to a {@link useSettleMutation} cycle. The operator sees the toggle flip
 * instantly (optimistic `pending`); the network call is held back until they stop fiddling for
 * 1200ms and only fires when the final value differs from what the server already has. Same-value
 * settles short-circuit before the request even leaves the browser.
 *
 * Backed by a backend that no-ops same-value PATCHes (no history row, no audit row) — the two
 * layers together produce a clean consent history that captures intent, not flicker.
 */
function ChannelToggle({
    channel,
    label,
    committedValue,
    committedAt,
    locale,
    t,
    customerId,
}: {
    channel: Channel;
    label: string;
    committedValue: boolean;
    committedAt: string | null;
    locale: Locale;
    t: (key: string) => string;
    customerId: number;
}) {
    const update = useUpdateCustomerMarketingPref(customerId);
    const { pending, isDebouncing, isSaving, setPending } = useSettleMutation<boolean, unknown>({
        committedValue,
        mutate: (value) => update.mutateAsync({ channel, opt_in: value, source: "admin" }),
    });

    const statusLine = (() => {
        if (isSaving) return t("marketingSaving");
        if (isDebouncing) return t("marketingPendingSave");
        if (committedAt !== null) return formatRelativeTime(committedAt, locale);
        return pending ? t("channelEnabled") : t("channelDisabled");
    })();

    return (
        <li className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="flex flex-col">
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground text-xs">{statusLine}</span>
            </div>
            <Switch checked={pending} onCheckedChange={() => setPending(!pending)} aria-label={label} />
        </li>
    );
}

export function MarketingPrefsCard({ customerId, locale, t }: MarketingPrefsCardProps) {
    const { data: prefs } = useCustomerMarketingPrefs(customerId);
    const { data: history = [] } = useCustomerMarketingHistory(customerId);

    const rows: Array<{ key: Channel; label: string; value: boolean; at: string | null }> = prefs
        ? [
              { key: "email", label: t("channelEmail"), value: prefs.emailOptIn, at: prefs.emailOptInAt },
              { key: "sms", label: t("channelSms"), value: prefs.smsOptIn, at: prefs.smsOptInAt },
              { key: "phone", label: t("channelPhone"), value: prefs.phoneCallOptIn, at: prefs.phoneCallOptInAt },
          ]
        : [];

    return (
        <div className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground text-xs">{t("marketingHint")}</p>
            <ul className="flex flex-col divide-y divide-border rounded-md border">
                {rows.map((r) => (
                    <ChannelToggle
                        key={r.key}
                        channel={r.key}
                        label={r.label}
                        committedValue={r.value}
                        committedAt={r.at}
                        locale={locale}
                        t={t}
                        customerId={customerId}
                    />
                ))}
            </ul>
            {history.length > 0 && (
                <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        {t("consentHistory")} ({history.length})
                    </summary>
                    <ul className="mt-2 flex max-h-60 flex-col gap-1 overflow-y-auto">
                        {history.map((h) => (
                            <li key={h.id} className="flex items-center justify-between rounded bg-muted/30 px-2 py-1">
                                <span>
                                    {h.channel} → {h.optedIn ? t("channelEnabled") : t("channelDisabled")}
                                </span>
                                <span className="text-muted-foreground">{formatRelativeTime(h.occurredAt, locale)}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}
