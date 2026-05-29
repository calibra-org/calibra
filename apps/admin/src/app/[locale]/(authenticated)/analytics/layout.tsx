import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { AnalyticsChrome } from "#/views/analytics/components/analytics-chrome";

interface LayoutProps {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}

export default async function AnalyticsLayout({ children, params }: LayoutProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <AnalyticsChrome>{children}</AnalyticsChrome>;
}
