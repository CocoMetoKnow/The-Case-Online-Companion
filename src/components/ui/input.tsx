import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      suppressHydrationWarning
      className={cn(
        "ui-field flex h-11 w-full rounded-[12px] border border-line bg-raised px-3 text-sm text-fg placeholder:text-subtle",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
