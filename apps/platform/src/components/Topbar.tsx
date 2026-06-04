import { LocaleSwitch } from "#/components/LocaleSwitch";
import { ThemeToggle } from "#/components/ThemeToggle";
import { UserMenu } from "#/components/UserMenu";

/** Console top bar: page title slot on the start side, operator controls on the end side. */
export function Topbar({ name, email }: { name: string; email: string }) {
    return (
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-border border-b bg-card/40 px-5">
            <div className="font-medium text-muted-foreground text-sm">{/* page header lives in each view */}</div>
            <div className="flex items-center gap-2">
                <ThemeToggle />
                <LocaleSwitch />
                <UserMenu name={name} email={email} />
            </div>
        </header>
    );
}
