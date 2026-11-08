import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.mjs';
import { navFor } from '../lib/nav.mjs';
import { Card, Notice, PageHeader } from '../components/ui.jsx';

export default function HomePage() {
  const { user } = useAuth();
  const menu = navFor(user.role).filter((i) => i.to !== '/');

  return (
    <>
      <PageHeader title={`Halo, ${user.name}`}>
        Masuk sebagai {user.role === 'ADMIN' ? 'admin' : 'pemilik'}.
      </PageHeader>

      {user.role === 'ADMIN' && <SystemStatus />}

      <ul className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
        {menu.map(({ to, label, icon: Icon, desc }) => (
          <li key={to}>
            <Link to={to} className="flex min-h-16 items-center gap-4 px-4 py-3 hover:bg-brand-soft">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-ink">{label}</span>
                <span className="block text-sm text-muted">{desc}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

// Memastikan backend dan database terhubung; berguna saat pertama kali setup dan deploy.
function SystemStatus() {
  const status = useQuery({
    queryKey: ['health-db'],
    queryFn: () => api.get('/api/health/db'),
    retry: false,
  });

  return (
    <Card className="p-4">
      <h2 className="mb-2 text-base font-bold text-ink">Status sistem</h2>
      {status.isPending && <Notice>Memeriksa koneksi database…</Notice>}
      {status.isError && <Notice tone="error">Database belum terhubung: {status.error.message}</Notice>}
      {status.isSuccess && <Notice tone="ok">Server dan database terhubung.</Notice>}
    </Card>
  );
}
