"use client";

import { useTranslations } from "next-intl";
import { createContext, type ReactNode, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { KeyboardShortcuts } from "#/components/KeyboardShortcuts";
import { DialogContent, DialogRoot } from "#/components/ui/dialog";
import {
    Command,
    CornerDownLeft,
    Layers,
    LayoutDashboard,
    type LucideIcon,
    Plus,
    Power,
    Search,
    Spinner,
    Store,
    UserCheck,
} from "#/icons";
import { fuzzyScore } from "#/lib/fuzzy";
import { useRouter } from "#/lib/i18n/navigation";
import { useSetTenantStatus, useTenants } from "#/lib/queries";
import { cn } from "#/lib/utils";

interface PaletteApi {
    /** Open the command palette from anywhere under the provider (Topbar search, ⌘K hint, …). */
    open: () => void;
    /** Open the keyboard-shortcuts cheatsheet. */
    openShortcuts: () => void;
}

const PaletteContext = createContext<PaletteApi | null>(null);

/** Access the command palette opener. Throws outside {@link CommandProvider}. */
export function useCommandPalette(): PaletteApi {
    const ctx = useContext(PaletteContext);
    if (ctx === null) throw new Error("useCommandPalette must be used within <CommandProvider>");
    return ctx;
}

/**
 * Mounts the ⌘K command palette + the global keyboard manager once, and exposes an `open()` opener
 * to the authenticated shell. Wrap the console layout in this so every route gets the palette.
 */
export function CommandProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const api = useMemo<PaletteApi>(() => ({ open: () => setOpen(true), openShortcuts: () => setHelpOpen(true) }), []);

    return (
        <PaletteContext.Provider value={api}>
            {children}
            <CommandPalette open={open} onOpenChange={setOpen} />
            <KeyboardShortcuts onOpenPalette={() => setOpen(true)} helpOpen={helpOpen} onHelpOpenChange={setHelpOpen} />
        </PaletteContext.Provider>
    );
}

interface CommandEntry {
    id: string;
    group: "actions" | "shops" | "shopActions";
    label: string;
    hint?: string;
    icon: LucideIcon;
    /** Extra searchable text not shown in the label. */
    keywords?: string;
    run: () => void | Promise<void>;
}

/** The ⌘K palette: fuzzy search over quick actions, shops, and per-shop operator actions. */
function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const t = useTranslations("Command");
    const tt = useTranslations("Tenants");
    const router = useRouter();
    const [query, setQuery] = useState("");
    const deferredQuery = useDeferredValue(query);
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const setStatus = useSetTenantStatus();
    const shopsQuery = useTenants({ page: 1, q: deferredQuery.trim() || undefined });
    const shops = shopsQuery.data?.data ?? [];

    /** Reset transient state whenever the palette opens. */
    useEffect(() => {
        if (open) {
            setQuery("");
            setActive(0);
        }
    }, [open]);

    /** base-ui focuses the dialog; nudge focus into the search field so typing starts immediately. */
    useEffect(() => {
        if (!open) return;
        const id = window.setTimeout(() => inputRef.current?.focus(), 20);
        return () => window.clearTimeout(id);
    }, [open]);

    function close() {
        onOpenChange(false);
    }

    function runEntry(entry: CommandEntry) {
        close();
        void entry.run();
    }

    /** Targeted impersonation requires choosing an operator + a reason, so the palette deep-links to
     * the shop's Operators tab where the reason modal lives, rather than minting blindly. */
    function doImpersonate(id: number | string) {
        router.push(`/tenants/${id}?tab=operators`);
    }

    const quickActions: CommandEntry[] = useMemo(
        () => [
            { id: "go-overview", group: "actions", label: t("goOverview"), icon: LayoutDashboard, run: () => router.push("/") },
            { id: "go-shops", group: "actions", label: t("goShops"), icon: Store, run: () => router.push("/tenants") },
            { id: "go-plans", group: "actions", label: t("goPlans"), icon: Layers, run: () => router.push("/plans") },
            { id: "provision", group: "actions", label: t("provision"), icon: Plus, run: () => router.push("/tenants/new") },
        ],
        [t, router],
    );

    const q = deferredQuery.trim();
    const filteredActions = useMemo(
        () =>
            quickActions
                .map((entry) => ({ entry, score: fuzzyScore(q, entry.label) }))
                .filter((row): row is { entry: CommandEntry; score: number } => row.score !== null)
                .sort((a, b) => b.score - a.score)
                .map((row) => row.entry),
        [quickActions, q],
    );

    const shopEntries = useMemo<CommandEntry[]>(
        () =>
            shops.slice(0, 7).map((shop) => ({
                id: `shop-${shop.id}`,
                group: "shops",
                label: shop.name,
                hint: shop.slug,
                icon: Store,
                run: () => router.push(`/tenants/${shop.id}`),
            })),
        [shops, router],
    );

    /** Per-shop operator commands for the query-matched shops. Plain (not memoized) — the list is
     * tiny and the run closures capture fresh mutation handles each render. */
    const shopActionEntries: CommandEntry[] =
        q.length === 0
            ? []
            : shops.slice(0, 4).flatMap<CommandEntry>((shop) => {
                  const isActive = shop.status === "active";
                  return [
                      {
                          id: `imp-${shop.id}`,
                          group: "shopActions",
                          label: `${t("impersonate")} · ${shop.name}`,
                          keywords: "impersonate login as",
                          icon: UserCheck,
                          run: () => doImpersonate(shop.id),
                      },
                      {
                          id: `status-${shop.id}`,
                          group: "shopActions",
                          label: `${isActive ? t("suspend") : t("activate")} · ${shop.name}`,
                          keywords: "suspend activate status",
                          icon: Power,
                          run: () => setStatus.mutate({ id: shop.id, status: isActive ? "suspended" : "active" }),
                      },
                  ];
              });

    /** Flat, ordered list the arrow keys traverse; the visual groups are derived from `group`. */
    const entries: CommandEntry[] = [...filteredActions, ...shopEntries, ...shopActionEntries];

    useEffect(() => {
        setActive((current) => (current >= entries.length ? 0 : current));
    }, [entries.length]);

    /** Keep the highlighted row scrolled into view. */
    useEffect(() => {
        const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
        node?.scrollIntoView({ block: "nearest" });
    }, [active]);

    function onKeyDown(event: React.KeyboardEvent) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((current) => Math.min(entries.length - 1, current + 1));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => Math.max(0, current - 1));
        } else if (event.key === "Enter") {
            event.preventDefault();
            const entry = entries[active];
            if (entry) runEntry(entry);
        }
    }

    const groups: { key: CommandEntry["group"]; label: string; items: CommandEntry[] }[] = [
        { key: "actions", label: t("actions"), items: entries.filter((e) => e.group === "actions") },
        { key: "shops", label: t("shops"), items: entries.filter((e) => e.group === "shops") },
        { key: "shopActions", label: t("shopActions"), items: entries.filter((e) => e.group === "shopActions") },
    ];

    return (
        <DialogRoot open={open} onOpenChange={onOpenChange}>
            <DialogContent
                size="lg"
                hideClose
                aria-label={t("placeholder")}
                /**
                 * Anchor toward the top third while staying horizontally centered. Overriding the
                 * single `transform` (translateX only) keeps the base Dialog's enter/exit animation
                 * — the `data-[starting|ending-style]` transforms below add a subtle vertical slide,
                 * and `left-1/2` + `translateX(-50%)` are physical, so it centers in LTR and RTL alike.
                 */
                className={cn(
                    "top-[12vh] gap-0 overflow-hidden p-0",
                    "[transform:translateX(-50%)]",
                    "data-[starting-style]:[transform:translateX(-50%)_translateY(-0.75rem)]",
                    "data-[ending-style]:[transform:translateX(-50%)_translateY(-0.75rem)]",
                )}
            >
                <div className="flex items-center gap-2.5 border-border border-b px-4">
                    <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder={t("placeholder")}
                        className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        aria-label={t("placeholder")}
                    />
                    {shopsQuery.isFetching ? <Spinner className="size-4 shrink-0 text-muted-foreground" /> : null}
                </div>

                <div ref={listRef} className="custom-scrollbar max-h-[min(56vh,420px)] overflow-y-auto p-2">
                    {entries.length === 0 ? (
                        <p className="px-2 py-8 text-center text-muted-foreground text-sm">{t("noResults")}</p>
                    ) : (
                        groups.map((group) =>
                            group.items.length === 0 ? null : (
                                <div key={group.key} className="mb-1">
                                    <p className="px-2 py-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                                        {group.label}
                                    </p>
                                    {group.items.map((entry) => {
                                        const index = entries.indexOf(entry);
                                        const isActive = index === active;
                                        return (
                                            <button
                                                key={entry.id}
                                                type="button"
                                                data-index={index}
                                                onMouseMove={() => setActive(index)}
                                                onClick={() => runEntry(entry)}
                                                className={cn(
                                                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start text-sm outline-none",
                                                    isActive ? "bg-accent text-accent-foreground" : "text-foreground",
                                                )}
                                            >
                                                <entry.icon
                                                    className="size-4 shrink-0 text-muted-foreground"
                                                    aria-hidden="true"
                                                />
                                                <span className="truncate">{entry.label}</span>
                                                {entry.hint ? (
                                                    <span className="ms-auto truncate font-mono text-muted-foreground text-xs">
                                                        {entry.hint}
                                                    </span>
                                                ) : null}
                                            </button>
                                        );
                                    })}
                                </div>
                            ),
                        )
                    )}
                </div>

                <div className="flex items-center gap-4 border-border border-t px-4 py-2 text-muted-foreground text-xs">
                    <span className="inline-flex items-center gap-1">
                        <Command className="size-3" aria-hidden="true" />K
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <CornerDownLeft className="size-3" aria-hidden="true" />
                        {t("hintOpen")}
                    </span>
                    <span className="ms-auto truncate">{tt("title")}</span>
                </div>
            </DialogContent>
        </DialogRoot>
    );
}
