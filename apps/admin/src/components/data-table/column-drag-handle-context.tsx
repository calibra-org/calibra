"use client";

import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { createContext, type ReactNode, useContext, useMemo } from "react";

interface ColumnDragHandle {
    attributes?: DraggableAttributes;
    listeners?: SyntheticListenerMap;
    isDragging: boolean;
    isDraggable: boolean;
}

const EMPTY: ColumnDragHandle = { isDragging: false, isDraggable: false };

const ColumnDragHandleContext = createContext<ColumnDragHandle>(EMPTY);

interface ProviderProps extends ColumnDragHandle {
    children: ReactNode;
}

/**
 * Forwards the active sortable's drag attributes/listeners from the wrapping `<th>` down to a
 * `<DataTableColumnHeader>` grip button. Lets the title remain a button (sort cycle) while the
 * grip handle is the only thing that initiates a drag.
 */
export function ColumnDragHandleProvider({ children, attributes, listeners, isDragging, isDraggable }: ProviderProps) {
    const value = useMemo<ColumnDragHandle>(
        () => ({ attributes, listeners, isDragging, isDraggable }),
        [attributes, listeners, isDragging, isDraggable],
    );
    return <ColumnDragHandleContext.Provider value={value}>{children}</ColumnDragHandleContext.Provider>;
}

export function useColumnDragHandle(): ColumnDragHandle {
    return useContext(ColumnDragHandleContext);
}
