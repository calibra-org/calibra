import { Inter, Vazirmatn } from "next/font/google";

/** Latin UI font. Exposed as `--font-inter` and consumed by the `--font-sans` stack in globals.css. */
export const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap",
});

/** Persian/Arabic UI font, preferred for `fa` so mixed Latin runs stay in one type system. */
export const vazirmatn = Vazirmatn({
    subsets: ["arabic", "latin"],
    variable: "--font-vazirmatn",
    display: "swap",
});

/** Both font CSS-variable classes, applied to `<html>` by every root layout. */
export const fontVariables = `${inter.variable} ${vazirmatn.variable}`;
