import { cn } from "@/lib/utils";

export function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-line bg-raised px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
