import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef, LabelHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent ${className}`}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...props }, ref) => (
    <textarea
      ref={ref}
      className={`w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent ${className}`}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export function Label({ className = "", ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`mb-1.5 block text-sm font-medium text-fg ${className}`} {...props} />;
}
