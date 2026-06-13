"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";

import { AgentsRoles } from "./agents-roles";
import { CannedResponses } from "./canned-responses";
import { Tags } from "./tags";

type SupportTab = "agents" | "tags" | "canned";

/** Tabbed shell composing the three support-config surfaces (agents / tags / canned responses). */
export function SupportSettings() {
    const t = useTranslations("Settings");
    const [tab, setTab] = useState<SupportTab>("agents");

    return (
        <Tabs value={tab} onValueChange={(value) => setTab(value as SupportTab)} variant="line">
            <TabsList className="mb-4">
                <TabsTrigger value="agents">{t("support.tabs.agents")}</TabsTrigger>
                <TabsTrigger value="tags">{t("support.tabs.tags")}</TabsTrigger>
                <TabsTrigger value="canned">{t("support.tabs.canned")}</TabsTrigger>
            </TabsList>
            <TabsContent value="agents">
                <AgentsRoles />
            </TabsContent>
            <TabsContent value="tags">
                <Tags />
            </TabsContent>
            <TabsContent value="canned">
                <CannedResponses />
            </TabsContent>
        </Tabs>
    );
}
