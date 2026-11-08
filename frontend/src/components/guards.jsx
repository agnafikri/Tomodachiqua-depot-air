import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoaderCircle, ShieldAlert, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Button } from './ui.jsx';

export function FullScreenMessage({ icon: Icon, title, children, action }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      {Icon && <Icon className="size-10 text-brand" aria-hidden="true" />}
      <h1 className="text-xl font-extrabold text-ink">{title}</h1>
      {children && <p className="max-w-sm text-base text-muted">{children}</p>}
      {action}
    </main>
  );
}

// Semua halaman di dalam wajib login.
export function RequireAuth() {
  const { user, isLoading, error, retry } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <FullScreenMessage icon={LoaderCircle} title="Memuat…">
        Server gratis kadang perlu waktu sekitar satu menit untuk bangun.
      </FullScreenMessage>
    );
  }
  if (error) {
    return (
      <FullScreenMessage
        icon={WifiOff}
        title="Tidak bisa terhubung"
        action={<Button onClick={() => retry()}>Coba lagi</Button>}
      >
        {error.message}
      </FullScreenMessage>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

// Halaman khusus peran tertentu. Pembatasan sebenarnya ada di backend; ini hanya tampilan.
export function RequireRole({ roles }) {
  const { user } = useAuth();
  if (!roles.includes(user.role)) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <ShieldAlert className="mx-auto size-10 text-danger" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-extrabold">Halaman ini khusus admin</h1>
        <p className="mt-1 text-muted">Akunmu tidak punya akses ke halaman ini.</p>
      </div>
    );
  }
  return <Outlet />;
}
