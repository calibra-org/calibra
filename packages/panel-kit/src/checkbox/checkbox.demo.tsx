"use client";

import { useState } from "react";

import { Label } from "../label";

import { Checkbox } from "./index";

/** Showcase demo for the Checkbox primitive. */
export function CheckboxDemo() {
    const [checked, setChecked] = useState(false);
    return (
        <div className="flex flex-col gap-3">
            <Label className="gap-2">
                <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} /> Toggle me
            </Label>
            <Label className="gap-2">
                <Checkbox defaultChecked /> Defaultly checked
            </Label>
            <Label className="gap-2">
                <Checkbox indeterminate /> Indeterminate
            </Label>
            <Label className="gap-2">
                <Checkbox disabled /> Disabled
            </Label>
            <Label className="gap-2">
                <Checkbox disabled defaultChecked /> Disabled + checked
            </Label>
        </div>
    );
}
