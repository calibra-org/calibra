"use client";

import { useState } from "react";

import { Label } from "#/components/ui/label";

import { Switch } from "./index";

/** Showcase demo for the Switch primitive. */
export function SwitchDemo() {
    const [on, setOn] = useState(true);
    return (
        <div className="flex flex-col gap-3">
            <Label className="gap-2">
                <Switch checked={on} onCheckedChange={setOn} /> Controlled — currently {on ? "on" : "off"}
            </Label>
            <Label className="gap-2">
                <Switch defaultChecked /> Defaultly on
            </Label>
            <Label className="gap-2">
                <Switch disabled /> Disabled
            </Label>
        </div>
    );
}
