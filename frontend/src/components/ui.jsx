import { forwardRef, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, X } from 'lucide-react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const VARIANTS = {
  primary: 'bg-brand text-white hover:bg-brand-dark active:bg-brand-deep disabled:bg-brand/50',
  secondary: 'bg-white text-brand border border-brand-line hover:bg-brand-soft disabled:text-brand/50',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-50',
  // Tombol bergaris merah untuk aksi pembatalan yang tidak boleh terlalu menonjol.
  dangerOutline: 'border border-danger/40 bg-white text-danger hover:bg-danger-soft active:bg-danger-soft disabled:opacity-50',
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
    // Padding bawaan p-5 dilewati bila pemakai memberi padding sendiri (mis. p-0 untuk daftar tepi ke tepi).
    <section className={cx('rounded-2xl border border-line bg-white', /(^|\s)p-\d/.test(className ?? '') ? '' : 'p-5', className)} {...props}>
      {children}
    </section>
  );
}

export function Notice({ tone = 'info', children, className, ...props }) {
  const tones = {
    info: 'bg-brand-soft text-brand-deep',
    error: 'bg-danger-soft text-danger',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
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

export function Badge({ tone = 'neutral', children }) {
  const tones = {
    neutral: 'bg-canvas text-muted',
    brand: 'bg-brand-soft text-brand-dark',
    ok: 'bg-ok-soft text-ok',
    danger: 'bg-danger-soft text-danger',
    warn: 'bg-warn-soft text-warn',
  };
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold', tones[tone])}>{children}</span>;
}

// Pilihan satu dari beberapa (mis. Diantar / Diambil). Tombol besar untuk jempol.
export function Segmented({ label, value, onChange, options }) {
  const labelId = useId();
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink" id={labelId}>
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="grid gap-1.5 rounded-2xl bg-canvas p-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-12 rounded-xl px-3 text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              value === o.value ? 'bg-brand text-white' : 'text-muted hover:bg-white',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Batang persentase (mis. isi toren). tone: ok | warn | danger.
export function ProgressBar({ percent, tone = 'ok', label }) {
  const colors = { ok: 'bg-brand', warn: 'bg-warn', danger: 'bg-danger' };
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-3 w-full overflow-hidden rounded-full bg-brand-soft">
      <div className={cx('h-full rounded-full transition-[width]', colors[tone])} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function Checkbox({ label, hint, className, ...props }) {
  return (
    <label className={cx('flex min-h-12 cursor-pointer items-center gap-3', className)}>
      <input type="checkbox" className="size-6 shrink-0 accent-brand" {...props} />
      <span>
        <span className="block text-base font-semibold text-ink">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
    </label>
  );
}

// Lembar dialog: dari bawah di HP, di tengah di komputer. Esc dan ketuk latar untuk menutup.
export function Sheet({ open, onClose, title, children }) {
  const panelRef = useRef(null);
  // onClose disimpan di ref agar efek di bawah hanya jalan saat dibuka/ditutup;
  // jika tidak, setiap ketikan (render ulang) akan merebut fokus dari kolom pencarian.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center lg:items-center">
      <div className="absolute inset-0 bg-ink/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white outline-none lg:max-w-lg lg:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-xl font-extrabold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Tutup" className="flex size-11 items-center justify-center rounded-xl text-muted hover:bg-canvas">
            <X className="size-6" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pt-2 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export { cx };
