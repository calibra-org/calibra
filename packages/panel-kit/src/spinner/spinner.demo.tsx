import { Spinner } from "./index";

/** Showcase demo for the Spinner primitive. */
export function SpinnerDemo() {
    return (
        <div className="flex flex-col gap-4">
            <h3 className="font-medium text-sm">Sizes</h3>
            <div className="flex items-end gap-6 text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                    <Spinner size="xs" />
                    <code className="text-xs">xs</code>
                </div>
                <div className="flex flex-col items-center gap-2">
                    <Spinner size="sm" />
                    <code className="text-xs">sm</code>
                </div>
                <div className="flex flex-col items-center gap-2">
                    <Spinner size="md" />
                    <code className="text-xs">md (default)</code>
                </div>
                <div className="flex flex-col items-center gap-2">
                    <Spinner size="lg" />
                    <code className="text-xs">lg</code>
                </div>
                <div className="flex flex-col items-center gap-2">
                    <Spinner size="xl" />
                    <code className="text-xs">xl</code>
                </div>
            </div>
        </div>
    );
}
