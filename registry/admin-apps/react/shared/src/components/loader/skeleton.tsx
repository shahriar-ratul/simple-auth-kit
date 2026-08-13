import { cn } from "@/lib/cn";

interface SkeletonProps {
  className?: string;
}

/** Base skeleton block — every other shape here is this, sized/shaped differently. */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

export function SkeletonAvatar({ size = "md", className }: { size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const sizeClasses = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-16 w-16", xl: "h-24 w-24" };
  return <Skeleton className={cn("rounded-full", sizeClasses[size], className)} />;
}

export function SkeletonBadge({ count = 1, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("flex gap-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-6 w-20" />
      ))}
    </div>
  );
}

export function SkeletonButton({ variant = "default", className }: { variant?: "default" | "icon"; className?: string }) {
  return <Skeleton className={cn(variant === "icon" ? "h-8 w-8" : "h-10 w-24", className)} />;
}

export function SkeletonActions({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("flex gap-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonButton key={i} variant="icon" />
      ))}
    </div>
  );
}
