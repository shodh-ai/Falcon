'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: ReactNode;
}

/**
 * Plain controlled input wrapper. When we add React Hook Form, swap the
 * body to spread RHF's `register(name)` instead of bare `...rest`.
 */
export function FormField({ label, error, hint, id, className, ...rest }: FormFieldProps) {
  const autoId = useId();
  const inputId = id ?? `field-${rest.name ?? autoId}`;
  return (
    <label htmlFor={inputId} className="block space-y-1.5">
      <span className="block text-sm font-semibold text-slate-700">{label}</span>
      <input
        id={inputId}
        className={`w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[#d6b65d] ${
          error ? 'border-red-400' : ''
        } ${className ?? ''}`}
        {...rest}
      />
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      {!error && hint && <p className="text-xs text-slate-500">{hint}</p>}
    </label>
  );
}
