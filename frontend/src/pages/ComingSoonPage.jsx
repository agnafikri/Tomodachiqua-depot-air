import { useLocation } from 'react-router-dom';
import { Hammer } from 'lucide-react';
import { NAV_ITEMS } from '../lib/nav.mjs';
import { Card, PageHeader } from '../components/ui.jsx';

// Penampung untuk halaman yang dibuat di fase berikutnya.
export default function ComingSoonPage() {
  const { pathname } = useLocation();
  const item = NAV_ITEMS.find((i) => i.to === pathname);

  return (
    <>
      <PageHeader title={item?.label ?? 'Halaman'}>{item?.desc}</PageHeader>
      <Card className="flex items-start gap-3">
        <Hammer className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
        <div>
          <p className="font-bold text-ink">Belum tersedia</p>
          <p className="text-muted">
            {item?.phase ? `Halaman ini dibuat di Fase ${item.phase}.` : 'Halaman ini sedang disiapkan.'}
          </p>
        </div>
      </Card>
    </>
  );
}
