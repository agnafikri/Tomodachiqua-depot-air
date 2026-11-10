import { NavLink, Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { navFor } from '../lib/nav.mjs';
import { cx } from './ui.jsx';
import { DropMark } from './Ripples.jsx';

const ROLE_LABEL = { ADMIN: 'Admin', PEMILIK: 'Pemilik' };

// HP: bar atas + navigasi bawah. Komputer (lg ke atas): sidebar. Berlaku untuk kedua peran;
// item khusus ADMIN hanya muncul untuk ADMIN.
export default function AppShell() {
  const { user, logout } = useAuth();
  const items = navFor(user.role);
  const mobileItems = items.filter((i) => i.mobile);
  const adminItems = items.filter((i) => !i.roles.includes('PEMILIK'));
  const commonItems = items.filter((i) => i.roles.includes('PEMILIK'));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      {/* Sidebar komputer */}
      <aside className="hidden border-r border-line bg-white print:hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="flex items-center gap-3 px-6 py-6">
          <DropMark className="size-10" />
          <div>
            <p className="text-lg font-extrabold leading-tight text-brand-deep">Tomodachiqua</p>
            <p className="text-sm text-muted">Depot air isi ulang</p>
          </div>
        </div>
        <nav aria-label="Menu utama" className="flex-1 overflow-y-auto px-3">
          <ul className="space-y-1">
            {commonItems.map((item) => (
              <SidebarLink key={item.to} item={item} />
            ))}
          </ul>
          {adminItems.length > 0 && (
            <>
              <p className="mt-6 mb-2 px-3 text-sm font-semibold text-muted">Khusus admin</p>
              <ul className="space-y-1">
                {adminItems.map((item) => (
                  <SidebarLink key={item.to} item={item} />
                ))}
              </ul>
            </>
          )}
        </nav>
        <div className="border-t border-line p-4">
          <p className="truncate text-base font-bold text-ink">{user.name}</p>
          <p className="mb-3 text-sm text-muted">{ROLE_LABEL[user.role]}</p>
          <button
            onClick={logout}
            className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-base font-semibold text-muted hover:bg-brand-soft hover:text-brand-dark"
          >
            <LogOut className="size-5" aria-hidden="true" />
            Keluar
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Bar atas HP */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white px-4 pt-[env(safe-area-inset-top)] print:hidden lg:hidden">
          <div className="flex min-h-14 items-center gap-2.5">
            <DropMark className="size-8" />
            <span className="text-lg font-extrabold text-brand-deep">Tomodachiqua</span>
          </div>
          <button
            onClick={logout}
            aria-label="Keluar"
            className="flex size-11 items-center justify-center rounded-xl text-muted hover:bg-brand-soft hover:text-brand-dark"
          >
            <LogOut className="size-5" aria-hidden="true" />
          </button>
        </header>

        <main className="mx-auto w-full max-w-3xl px-4 pt-5 pb-28 print:max-w-none print:p-0 lg:max-w-5xl lg:px-10 lg:pt-10 lg:pb-12">
          <Outlet />
        </main>
      </div>

      {/* Navigasi bawah HP */}
      <nav
        aria-label="Menu utama"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] print:hidden lg:hidden"
      >
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}>
          {mobileItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cx(
                    'flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold',
                    isActive ? 'text-brand' : 'text-muted',
                  )
                }
              >
                <Icon className="size-6" aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function SidebarLink({ item: { to, label, icon: Icon } }) {
  return (
    <li>
      <NavLink
        to={to}
        end={to === '/'}
        className={({ isActive }) =>
          cx(
            'flex min-h-11 items-center gap-3 rounded-xl px-3 text-base font-semibold',
            isActive ? 'bg-brand-soft text-brand-dark' : 'text-muted hover:bg-canvas hover:text-ink',
          )
        }
      >
        <Icon className="size-5" aria-hidden="true" />
        {label}
      </NavLink>
    </li>
  );
}
