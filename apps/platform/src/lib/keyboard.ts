/**
 * True when the event target is a field the operator is typing into (input / textarea / select /
 * contenteditable). Keyboard shortcuts must bail out for these so typing isn't hijacked. Shared by
 * the global shortcut manager and per-view list navigation.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}
