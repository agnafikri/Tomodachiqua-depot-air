import { LoaderCircle } from 'lucide-react';
import { useServerWaking } from '../lib/api.mjs';

// Muncul bila respons lebih dari beberapa detik, supaya pengguna tahu aplikasi sedang bekerja.
export default function ServerWakingBanner() {
  const waking = useServerWaking();
  if (!waking) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-brand-deep px-4 py-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] text-sm font-semibold text-white"
    >
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      Memuat data…
    </div>
  );
}
