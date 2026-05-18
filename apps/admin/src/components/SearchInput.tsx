import { Search } from "lucide-react";

import { Input } from "#/components/ui/input";

interface SearchInputProps {
    placeholder: string;
    name?: string;
    defaultValue?: string;
}

export function SearchInput({ placeholder, name = "search", defaultValue }: SearchInputProps) {
    return (
        <div className="relative max-w-sm flex-1">
            <Search
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
            />
            <Input
                type="search"
                name={name}
                defaultValue={defaultValue}
                placeholder={placeholder}
                className="ps-9"
                aria-label={placeholder}
            />
        </div>
    );
}
