import { type TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-28 w-full rounded-[12px] border border-line bg-raised px-3 py-2 text-base text-fg sm:text-sm placeholder:text-subtle",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
