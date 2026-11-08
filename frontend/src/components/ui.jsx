import { forwardRef, useId } from 'react';
import { LoaderCircle } from 'lucide-react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const VARIANTS = {
  primary: 'bg-brand text-white hover:bg-brand-dark active:bg-brand-deep disabled:bg-brand/50',
  secondary: 'bg-white text-brand border border-brand-line hover:bg-brand-soft disabled:text-brand/50',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-50',
  ghost: 'text-muted hover:bg-brand-soft hover:text-brand-dark',
};

// Tinggi minimal 48 px agar mudah diketuk di HP.
export function Button({ variant = 'primary', loading = false, className, children, disabled, ...props }) {
  return (
    <button
      className={cx(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-colors disabled:cursor-not-allowed',
        VARIANTS[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export const Input = forwardRef(function Input({ label, error, hint, className, id, trailing, ...props }, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          className={cx(
            'block min-h-12 w-full rounded-xl border bg-white px-4 text-base text-ink placeholder:text-muted/70',
            error ? 'border-danger' : 'border-line',
            trailing && 'pr-12',
          )}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
      {hint && !error && (
        <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
});

export function Card({ className, children, ...props }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-white p-5', className)} {...props}>
      {children}
    </section>
  );
}

export function Notice({ tone = 'info', children, className, ...props }) {
  const tones = {
    info: 'bg-brand-soft text-brand-deep',
    error: 'bg-danger-soft text-danger',
    ok: 'bg-ok-soft text-ok',
  };
  return (
    <div className={cx('rounded-xl px-4 py-3 text-sm font-medium', tones[tone], className)} {...props}>
      {children}
    </div>
  );
}

export function PageHeader({ title, children }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
      {children && <p className="mt-1 text-base text-muted">{children}</p>}
    </header>
  );
}

export { cx };
