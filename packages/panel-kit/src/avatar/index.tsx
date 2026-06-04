import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import { cn } from "@calibra/shared";
import type { ComponentProps } from "react";

export function Avatar({ className, ...props }: ComponentProps<typeof BaseAvatar.Root>) {
    return (
        <BaseAvatar.Root
            data-slot="avatar"
            className={cn("relative flex size-8 shrink-0 overflow-hidden rounded-full", className)}
            {...props}
        />
    );
}
Avatar.displayName = "Avatar";

export function AvatarImage({ className, ...props }: ComponentProps<typeof BaseAvatar.Image>) {
    return <BaseAvatar.Image data-slot="avatar-image" className={cn("aspect-square size-full", className)} {...props} />;
}
AvatarImage.displayName = "AvatarImage";

export function AvatarFallback({ className, ...props }: ComponentProps<typeof BaseAvatar.Fallback>) {
    return (
        <BaseAvatar.Fallback
            data-slot="avatar-fallback"
            className={cn("flex size-full items-center justify-center rounded-full bg-muted font-medium text-xs", className)}
            {...props}
        />
    );
}
AvatarFallback.displayName = "AvatarFallback";
