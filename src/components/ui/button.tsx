import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { hapticTap } from "@/lib/game/haptics";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "ui-btn inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-fg hover:bg-accent/90",
        paper: "bg-paper text-ink hover:bg-paper/90",
        outline:
          "border border-line bg-transparent text-fg hover:bg-raised",
        ghost: "text-muted hover:bg-raised hover:text-fg",
        brass: "bg-brass text-ink hover:bg-brass/90",
      },
      size: {
        default: "h-11 rounded-[12px] px-4 text-sm",
        sm: "h-9 rounded-[10px] px-3 text-sm",
        lg: "h-12 rounded-[14px] px-5 text-base",
        icon: "size-11 rounded-[12px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, onClick, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) hapticTap();
      }}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
