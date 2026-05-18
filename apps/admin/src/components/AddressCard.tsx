import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import type { AdminOrderAddress } from "#/lib/mock/types";

interface AddressCardProps {
    title: string;
    address: AdminOrderAddress;
    locale: Locale;
}

export function AddressCard({ title, address }: AddressCardProps) {
    const t = useTranslations("Address");
    return (
        <Card>
            <CardHeader className="border-b pb-4">
                <CardTitle className="text-sm">{title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 pt-4 text-sm">
                <div className="font-medium">
                    {address.firstName} {address.lastName}
                </div>
                {address.company !== null && <div className="text-muted-foreground">{address.company}</div>}
                <div>{address.addressLine1}</div>
                {address.addressLine2 !== null && <div>{address.addressLine2}</div>}
                <div className="text-muted-foreground">
                    {address.city}, {address.provinceCode} · {address.postcode}
                </div>
                <div className="text-muted-foreground">{address.country}</div>
                <div className="pt-2 text-muted-foreground">
                    <span className="font-medium text-foreground">{t("phone")}:</span> {address.phone}
                </div>
                {address.nationalId !== null && (
                    <div className="text-muted-foreground">
                        <span className="font-medium text-foreground">{t("nationalId")}:</span> {address.nationalId}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
