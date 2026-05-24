"use client";

import type { Locale } from "@calibra/shared/i18n";

import { Switch } from "#/components/ui/switch";
import { formatRelativeTime } from "#/lib/format";
import { useCustomerMarketingHistory, useCustomerMarketingPrefs, useUpdateCustomerMarketingPref } from "#/lib/queries/customers";

interface MarketingPrefsCardProps {
    customerId: number;
    locale: Locale;
    t: (key: string) => string;
}

export function MarketingPrefsCard({ customerId, locale, t }: MarketingPrefsCardProps) {
    const { data: prefs } = useCustomerMarketingPrefs(customerId);
    const { data: history = [] } = useCustomerMarketingHistory(customerId);
    const update = useUpdateCustomerMarketingPref(customerId);

    const toggle = (channel: "email" | "sms" | "phone", current: boolean) => {
        update.mutate({ channel, opt_in: !current, source: "admin" });
    };

    const rows: Array<{ key: string; label: string; current: boolean; at: string | null }> = prefs
        ? [
              { key: "email", label: t("channelEmail"), current: prefs.emailOptIn, at: prefs.emailOptInAt },
              { key: "sms", label: t("channelSms"), current: prefs.smsOptIn, at: prefs.smsOptInAt },
              {
                  key: "phone",
                  label: t("channelPhone"),
                  current: prefs.phoneCallOptIn,
                  at: prefs.phoneCallOptInAt,
              },
          ]
        : [];

    return (
        <div className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground text-xs">{t("marketingHint")}</p>
            <ul className="flex flex-col divide-y divide-border rounded-md border">
                {rows.map((r) => (
                    <li key={r.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="flex flex-col">
                            <span className="font-medium">{r.label}</span>
                            <span className="text-muted-foreground text-xs">
                                {r.at !== null
                                    ? formatRelativeTime(r.at, locale)
                                    : r.current
                                      ? t("channelEnabled")
                                      : t("channelDisabled")}
                            </span>
                        </div>
                        <Switch
                            checked={r.current}
                            onCheckedChange={() => toggle(r.key as "email" | "sms" | "phone", r.current)}
                            disabled={update.isPending}
                            aria-label={r.label}
                        />
                    </li>
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
