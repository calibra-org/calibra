import { setRequestLocale } from "next-intl/server";

import { SeoWorkspaceView } from "#/features/seo/workspace";

export default async function SeoLiveEditorPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <SeoWorkspaceView mode="live-editor" />;
}
