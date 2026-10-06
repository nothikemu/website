import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "xs" | "sm" | "md" | "icon" | "icon-sm";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover border border-transparent shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]",
  secondary: "bg-surface-2 text-fg border border-border hover:bg-surface-3 hover:border-border-strong",
  outline: "bg-transparent text-fg border border-border hover:bg-surface-2",
  ghost: "bg-transparent text-fg-muted hover:text-fg hover:bg-surface-2 border border-transparent",
  danger: "bg-red text-white hover:opacity-90 border border-transparent",
};
const sizes: Record<Size, string> = {
  xs: "h-6 px-2 text-xs gap-1 rounded-sm",
  sm: "h-7 px-2.5 text-sm gap-1.5 rounded-md",
  md: "h-8 px-3 text-sm gap-2 rounded-md",
  icon: "h-8 w-8 justify-center rounded-md",
  "icon-sm": "h-6 w-6 justify-center rounded-sm",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner className="size-3.5" /> : null}
      {children}
    </button>
  );
});

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center font-medium whitespace-nowrap transition-colors select-none",
    variants[variant],
    sizes[size],
    className,
  );
}
