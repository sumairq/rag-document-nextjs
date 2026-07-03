import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * The single button system for the whole app. Four intents and three sizes,
 * each with deliberate hover / active / disabled states. Built on design tokens
 * so a color change ripples everywhere.
 *
 *   primary      solid accent — the one clearly-clickable call to action
 *   secondary    bordered surface — neutral, equal-weight actions
 *   ghost        text-only — low-emphasis / toolbar actions
 *   destructive  solid danger — irreversible actions (confirmed separately)
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "icon";

const BASE =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-fg shadow-xs hover:bg-accent-hover active:bg-accent-active",
  secondary:
    "border border-border-strong bg-surface text-foreground hover:bg-surface-2 active:bg-surface-3",
  ghost:
    "text-muted hover:bg-surface-2 hover:text-foreground active:bg-surface-3",
  destructive:
    "bg-danger text-danger-fg shadow-xs hover:bg-danger-hover active:brightness-95",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-sm",
  icon: "h-8 w-8 p-0 text-sm",
};

/**
 * The shared class string for the button system. Use this to style a non-button
 * element (e.g. a Next `<Link>`) so links and buttons stay visually identical.
 */
export function buttonClassName({
  variant = "secondary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, className })}
      {...props}
    />
  );
}
