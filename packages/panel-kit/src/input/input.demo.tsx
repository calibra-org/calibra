import { Label } from "../label";

import { Input } from "./index";

/** Showcase demo for the Input primitive. */
export function InputDemo() {
    return (
        <div className="flex max-w-md flex-col gap-4">
            <div className="flex flex-col gap-1">
                <Label htmlFor="demo-input-default">Default</Label>
                <Input id="demo-input-default" placeholder="Placeholder text" />
            </div>
            <div className="flex flex-col gap-1">
                <Label htmlFor="demo-input-required" required>
                    Required
                </Label>
                <Input id="demo-input-required" placeholder="Cannot be empty" required />
            </div>
            <div className="flex flex-col gap-1">
                <Label htmlFor="demo-input-invalid">Invalid</Label>
                <Input id="demo-input-invalid" defaultValue="invalid value" aria-invalid />
            </div>
            <div className="flex flex-col gap-1">
                <Label htmlFor="demo-input-disabled">Disabled</Label>
                <Input id="demo-input-disabled" defaultValue="Disabled input" disabled />
            </div>
        </div>
    );
}
